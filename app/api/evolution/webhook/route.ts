import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadEvolutionMedia, isAuthorizedEvolutionWebhook, extractEvolutionMessages, extractEvolutionMessageStatusUpdates, getEvolutionGroupSubject, resolveDepartmentForMessage } from '@/lib/evolution-routing'
import { randomUUID } from 'node:crypto'
import { publishEvent } from '@/lib/redis'
import { uploadFile } from '@/lib/r2'
import { calculateSLADueDates } from '@/lib/routing/sla'
import { findDealerForEvolutionMessage } from '@/lib/evolution-operations'
import { getEvolutionAgentQueue } from '@/lib/queues/jobs'

const MAX_MEDIA_BYTES = 25 * 1024 * 1024

function inboundMediaFileName(item: ReturnType<typeof extractEvolutionMessages>[number]): string {
  if (item.mediaFileName) return item.mediaFileName
  const extension = item.mediaMimeType?.split('/')[1]?.split(';')[0] || 'bin'
  return `${item.mediaType || 'attachment'}.${extension}`
}

async function getOwnerUserId(): Promise<number | null> {
  const configured = Number(process.env.EVOLUTION_OWNER_USER_ID)
  if (Number.isInteger(configured) && configured > 0) return configured
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { id: 'asc' }, select: { id: true } })
  return owner?.id ?? null
}

// A single app container handles all webhooks in this deployment. Serialising
// work by (owner, group) ensures the next message sees the department chosen
// by the previous message, rather than making a handoff decision from stale
// state. The database unique constraint remains the final dedupe safeguard.
const groupQueues = new Map<string, Promise<void>>()

async function withGroupLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = groupQueues.get(key) ?? Promise.resolve()
  let releaseCurrent!: () => void
  const current = new Promise<void>((resolve) => { releaseCurrent = resolve })
  const queued = previous.catch(() => undefined).then(() => current)
  groupQueues.set(key, queued)

  await previous.catch(() => undefined)
  try {
    return await work()
  } finally {
    releaseCurrent()
    if (groupQueues.get(key) === queued) groupQueues.delete(key)
  }
}

async function processIncoming(ownerUserId: number, incoming: ReturnType<typeof extractEvolutionMessages>, correlationId: string) {
  for (const item of incoming) {
    // Evolution also sends MESSAGES_UPSERT for messages sent by the CRM.
    // They have already been stored by the outbound route and must never
    // trigger a fresh routing decision or a department handoff.
    // Do not route CRM-sent messages back in as enquiries. Reactions are the
    // exception: they are UI state on an existing message and should remain
    // visible whether a dealer or the connected WhatsApp account added them.
    if (item.fromMe && !item.isReaction) continue

    try {
      await withGroupLock(`${ownerUserId}:${item.groupJid}`, async () => {
        // A WhatsApp reaction is an update to an existing provider message,
        // never a fresh dealer enquiry. Persist/update it separately so it is
        // visible in the inbox without changing routing, SLA, or unread state.
        if (item.isReaction) {
          // A malformed provider reaction without an original message ID is
          // deliberately ignored. It must never appear as a literal
          // "[reactionMessage]" bubble or create/alter an inquiry.
          if (!item.reactionTargetMessageId) {
            console.warn(`[evolution/webhook] ignored reaction without target message id: ${item.messageId}`)
            return
          }
          const group = await prisma.evolutionGroup.findUnique({
            where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
            select: { id: true, departmentId: true },
          })
          if (!group) return
          if (item.reactionEmoji) {
            await prisma.evolutionGroupReaction.upsert({
              where: { groupId_targetMessageId_senderJid: { groupId: group.id, targetMessageId: item.reactionTargetMessageId, senderJid: item.senderJid } },
              update: { reactionMessageId: item.messageId, senderName: item.senderName, emoji: item.reactionEmoji },
              create: { groupId: group.id, reactionMessageId: item.messageId, targetMessageId: item.reactionTargetMessageId, senderJid: item.senderJid, senderName: item.senderName, emoji: item.reactionEmoji, createdAt: item.createdAt },
            })
          } else {
            await prisma.evolutionGroupReaction.deleteMany({ where: { groupId: group.id, targetMessageId: item.reactionTargetMessageId, senderJid: item.senderJid } })
          }
          const recipients = await prisma.user.findMany({
            where: { isActive: true, OR: [{ id: ownerUserId }, ...(group.departmentId ? [{ routingDepartmentId: group.departmentId }] : [])] },
            select: { id: true },
          })
          void publishEvent('chat_events', {
            type: 'reaction_update', userId: String(ownerUserId), userIds: recipients.map((user) => String(user.id)), conversationId: group.id,
            payload: { targetMessageId: item.reactionTargetMessageId, emoji: item.reactionEmoji, senderJid: item.senderJid },
          })
          return
        }

        const duplicate = await prisma.evolutionGroupMessage.findFirst({
          where: { messageId: item.messageId, group: { is: { userId: ownerUserId, groupJid: item.groupJid } } },
          select: { id: true },
        })

        if (duplicate) return

        const subject = item.subject === item.groupJid ? (await getEvolutionGroupSubject(item.groupJid)) || item.subject : item.subject
        let storedMediaUrl: string | null = null
        if (item.mediaType) {
          const media = await downloadEvolutionMedia(item.rawMessage)
          if (media && media.length <= MAX_MEDIA_BYTES) {
            storedMediaUrl = await uploadFile(
              media,
              inboundMediaFileName(item),
              item.mediaMimeType || 'application/octet-stream',
              `evolution/inbound/${ownerUserId}`,
            )
          } else if (media) {
            console.warn(`[evolution/media] inbound media exceeds ${MAX_MEDIA_BYTES} bytes; message ${item.messageId} kept without file`)
          }
        }
        const previous = await prisma.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } }, select: { departmentId: true } })
        
        const routingMatches = await resolveDepartmentForMessage({ 
          groupJid: item.groupJid, 
          subject, 
          text: item.text, 
          mentionedJids: item.mentionedJids,
          existingDepartmentIds: previous?.departmentId ? [previous.departmentId] : undefined 
        })
        const primaryRouting = routingMatches[0] || { departmentId: null, departmentName: null, routingReason: null, routeType: "default", intent: null, confidence: null, assignedUserId: null, mentionPriority: false }
        
        const dealerMatch = await findDealerForEvolutionMessage({
          userId: ownerUserId,
          groupJid: item.groupJid,
          senderJid: item.senderJid,
        })
        
        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } }, select: { id: true, departmentId: true, assignedUserId: true } })
          const fromDepartmentId = current?.departmentId ?? null
          
          const group = await tx.evolutionGroup.upsert({
            where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
            update: { 
              subject,
              lastMessageText: item.text || `[${item.messageType}]`, 
              lastMessageAt: item.createdAt, 
              lastInboundAt: item.createdAt, 
              unreadCount: { increment: 1 },
              departmentId: primaryRouting.departmentId, 
              departmentName: primaryRouting.departmentName, 
              routingReason: primaryRouting.routingReason, 
              routeType: primaryRouting.routeType, 
              intent: primaryRouting.intent ?? null, 
              confidence: primaryRouting.confidence ?? null, 
              assignedUserId: primaryRouting.assignedUserId ?? current?.assignedUserId ?? null, 
              mentionPriority: primaryRouting.mentionPriority, 
              ...(primaryRouting.mentionPriority ? { lastMentionAt: item.createdAt } : {}) 
            },
            create: { 
              userId: ownerUserId, 
              groupJid: item.groupJid, 
              subject,
              lastMessageText: item.text || `[${item.messageType}]`, 
              lastMessageAt: item.createdAt, 
              lastInboundAt: item.createdAt, 
              unreadCount: 1,
              departmentId: primaryRouting.departmentId, 
              departmentName: primaryRouting.departmentName, 
              routingReason: primaryRouting.routingReason, 
              routeType: primaryRouting.routeType, 
              intent: primaryRouting.intent ?? null, 
              confidence: primaryRouting.confidence ?? null, 
              assignedUserId: primaryRouting.assignedUserId ?? null, 
              mentionPriority: primaryRouting.mentionPriority, 
              ...(primaryRouting.mentionPriority ? { lastMentionAt: item.createdAt } : {}) 
            },
          })
          if (dealerMatch) {
            await tx.dealerEvolutionIdentity.upsert({
              where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
              update: { dealerId: dealerMatch.dealerId, phone: dealerMatch.matchedPhone, lastSeenAt: item.createdAt },
              create: { userId: ownerUserId, dealerId: dealerMatch.dealerId, groupJid: item.groupJid, phone: dealerMatch.matchedPhone, lastSeenAt: item.createdAt },
            })
          }
          const inquiry = await tx.evolutionDealerInquiry.upsert({
            where: { groupId: group.id },
            update: {
              ...(dealerMatch ? { dealerId: dealerMatch.dealerId, dealerPhone: dealerMatch.matchedPhone } : {}),
              departmentId: primaryRouting.departmentId,
              assignedUserId: primaryRouting.assignedUserId ?? current?.assignedUserId ?? undefined,
              title: subject,
              lastActivityAt: item.createdAt,
            },
            create: {
              groupId: group.id,
              dealerId: dealerMatch?.dealerId ?? null,
              dealerPhone: dealerMatch?.matchedPhone ?? null,
              ownerUserId,
              departmentId: primaryRouting.departmentId,
              assignedUserId: primaryRouting.assignedUserId ?? null,
              title: subject,
              openedAt: item.createdAt,
              lastActivityAt: item.createdAt,
            },
          })
          const ticket = await tx.evolutionGroupTicket.upsert({
            where: { groupId: group.id },
            update: { status: 'open', inquiryId: inquiry.id, departmentId: primaryRouting.departmentId, departmentName: primaryRouting.departmentName, assignedUserId: primaryRouting.assignedUserId ?? current?.assignedUserId ?? undefined, routeType: primaryRouting.routeType, lastIntent: primaryRouting.intent ?? null, confidence: primaryRouting.confidence ?? null },
            create: { groupId: group.id, status: 'open', inquiryId: inquiry.id, departmentId: primaryRouting.departmentId, departmentName: primaryRouting.departmentName, assignedUserId: primaryRouting.assignedUserId ?? null, assignedAt: primaryRouting.assignedUserId ? item.createdAt : null, routeType: primaryRouting.routeType, lastIntent: primaryRouting.intent ?? null, confidence: primaryRouting.confidence ?? null },
          })

          for (const match of routingMatches) {
            if (!match.departmentId) continue
            
            const workItem = await tx.departmentWorkItem.upsert({
              where: { ticketId_departmentId_sourceMessageId: { ticketId: ticket.id, departmentId: match.departmentId, sourceMessageId: item.messageId } },
              update: {},
              create: {
                ticketId: ticket.id,
                departmentId: match.departmentId,
                departmentName: match.departmentName || '',
                assignedUserId: match.assignedUserId ?? null,
                status: 'open',
                routeType: match.routeType,
                routingReason: match.routingReason,
                confidence: match.confidence ?? null,
                intent: match.intent ?? null,
                mentionPriority: match.mentionPriority,
                sourceMessageId: item.messageId,
              }
            })

            const departmentSLA = await tx.departmentSLA.findUnique({ where: { departmentId: match.departmentId } });
            if (departmentSLA) {
              // @ts-ignore - calculateSLADueDates imported
              const dueDates = calculateSLADueDates(departmentSLA, item.createdAt);
              await tx.workItemSLA.upsert({
                where: { workItemId: workItem.id },
                update: { firstResponseDue: dueDates.firstResponseDue, resolutionDue: dueDates.resolutionDue },
                create: { workItemId: workItem.id, firstResponseDue: dueDates.firstResponseDue, resolutionDue: dueDates.resolutionDue }
              });
            }
            
            await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: item.messageId, event: 'ROUTED_WORK_ITEM', routeType: match.routeType, toDepartmentId: match.departmentId, confidence: match.confidence ?? null, reason: match.routingReason } })
          }

          const message = await tx.evolutionGroupMessage.create({ data: { groupId: group.id, messageId: item.messageId, senderJid: item.senderJid, senderName: item.senderName, text: item.text, messageType: item.messageType, mediaUrl: storedMediaUrl, quotedMessageId: item.quotedMessageId, mentionedJids: item.mentionedJids, fromMe: false, status: 'received', createdAt: item.createdAt } })
          const campaignRecipient = await tx.evolutionCampaignRecipient.findFirst({
            where: {
              groupJid: item.groupJid,
              campaign: { userId: ownerUserId },
              repliedAt: null,
              status: { in: ['SENT', 'DELIVERED', 'READ'] },
            },
            orderBy: { sentAt: 'desc' },
            select: { id: true },
          })
          if (campaignRecipient) {
            await tx.evolutionCampaignRecipient.update({
              where: { id: campaignRecipient.id },
              data: { status: 'REPLIED', repliedAt: item.createdAt, responseMessageId: message.id },
            })
          }
          const isHandoff = fromDepartmentId !== null && primaryRouting.departmentId !== null && fromDepartmentId !== primaryRouting.departmentId
          // tx.evolutionRoutingAudit.create for general routing is disabled, instead we did it per-department earlier
          return { message, group, ticketId: ticket.id, inquiryId: inquiry.id, routingMatches }
        })
        
        const departmentIds = result.routingMatches.map(m => m.departmentId).filter((id): id is number => id !== null)
        const recipients = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { id: ownerUserId },
              ...(departmentIds.length > 0 ? [{ routingDepartmentId: { in: departmentIds } }] : []),
            ],
          },
          select: { id: true },
        })
        void publishEvent('chat_events', {
          type: 'new_message',
          userId: String(ownerUserId),
          userIds: recipients.map((user) => String(user.id)),
          conversationId: result.group.id,
          payload: result,
        })

        // Queue RAG after persistence so an Evolution retry cannot create a
        // second CRM record. The worker is disabled/draft-only unless an admin
        // opts in, so a routing webhook can never surprise-send a dealer.
        void getEvolutionAgentQueue().add('grounded-group-reply', {
          ownerUserId,
          groupId: result.group.id,
          inboundMessageId: result.message.id,
        }, { jobId: `evolution-agent:${result.message.id}` }).catch((error) => {
          console.error('[evolution/webhook] unable to enqueue RAG draft:', error)
        })

        // Create user-scoped notifications for each recipient locally since recipients and result exist now
        const recipientIds = recipients.map((r) => r.id);
        await Promise.all(recipientIds.map((uId) =>
          prisma.notification.create({
            data: {
              userId: uId,
              type: 'whatsapp',
              title: item.senderName || item.senderJid.split('@')[0] || 'WhatsApp Group',
              subtitle: item.text ? (item.text.length > 50 ? item.text.substring(0, 50) + '...' : item.text) : 'New message in Group',
              href: '/routing-crm?group_id=' + result.group.id,
              sourceId: item.messageId,
            }
          })
        )).catch(err => { console.error('[evolution/webhook] Failed to create notifications', err); return []; });
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Unique constraint')) continue
      console.error('[evolution/webhook] message processing failed:', error)
      await prisma.evolutionWebhookHealth.upsert({
        where: { ownerUserId },
        update: { lastErrorAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Message processing failed' },
        create: { ownerUserId, lastErrorAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Message processing failed' },
      }).catch(() => undefined)
    }
  }
}

async function processProviderStatusUpdates(ownerUserId: number, updates: ReturnType<typeof extractEvolutionMessageStatusUpdates>) {
  for (const update of updates) {
    if (!update.fromMe) continue
    const recipient = await prisma.evolutionCampaignRecipient.findFirst({
      where: {
        providerMessageId: update.messageId,
        campaign: { userId: ownerUserId },
        ...(update.groupJid ? { groupJid: update.groupJid } : {}),
      },
      select: { id: true, status: true, deliveredAt: true, readAt: true },
    })
    if (!recipient) continue
    if (update.status === 'READ') {
      await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'READ', deliveredAt: recipient.deliveredAt || update.updatedAt, readAt: recipient.readAt || update.updatedAt } })
    } else if (update.status === 'DELIVERED' && recipient.status !== 'READ') {
      await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'DELIVERED', deliveredAt: recipient.deliveredAt || update.updatedAt } })
    }
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedEvolutionWebhook(request)) return NextResponse.json({ error: 'Invalid Evolution webhook credentials' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const ownerUserId = await getOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const correlationId = `evo-${randomUUID()}`
  const incoming = extractEvolutionMessages(body)
  const statusUpdates = extractEvolutionMessageStatusUpdates(body)
  const root = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const event = typeof root.event === 'string' ? root.event : typeof root.type === 'string' ? root.type : 'unknown'
  await prisma.evolutionWebhookHealth.upsert({
    where: { ownerUserId },
    update: { lastReceivedAt: new Date(), lastEvent: event, lastMessageId: incoming[0]?.messageId || statusUpdates[0]?.messageId || null, lastCorrelationId: correlationId, lastError: null },
    create: { ownerUserId, lastReceivedAt: new Date(), lastEvent: event, lastMessageId: incoming[0]?.messageId || statusUpdates[0]?.messageId || null, lastCorrelationId: correlationId },
  }).catch((error) => console.error('[evolution/webhook] heartbeat update failed:', error))
  void processIncoming(ownerUserId, incoming, correlationId).catch((error) => console.error('[evolution/webhook] processing failed:', error))
  void processProviderStatusUpdates(ownerUserId, statusUpdates).catch((error) => console.error('[evolution/webhook] campaign status processing failed:', error))
  return NextResponse.json({ ok: true, received: incoming.length, statusUpdates: statusUpdates.length, correlationId, accepted: 'processing' })
}
