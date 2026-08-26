import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadEvolutionMedia, isAuthorizedEvolutionWebhook, extractEvolutionMessages, getEvolutionGroupSubject, resolveDepartmentForMessage } from '@/lib/evolution-routing'
import { publishEvent } from '@/lib/redis'
import { uploadFile } from '@/lib/r2'
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

async function processIncoming(ownerUserId: number, incoming: ReturnType<typeof extractEvolutionMessages>) {
  for (const item of incoming) {
    // Evolution also sends MESSAGES_UPSERT for messages sent by the CRM.
    // They have already been stored by the outbound route and must never
    // trigger a fresh routing decision or a department handoff.
    // Do not route CRM-sent messages back in as enquiries. Reactions are the
    // exception: they are UI state on an existing message and should remain
    // visible whether a dealer or the connected WhatsApp account added them.
    if (item.fromMe && !item.reactionTargetMessageId) continue

    try {
      await withGroupLock(`${ownerUserId}:${item.groupJid}`, async () => {
        // A WhatsApp reaction is an update to an existing provider message,
        // never a fresh dealer enquiry. Persist/update it separately so it is
        // visible in the inbox without changing routing, SLA, or unread state.
        if (item.reactionTargetMessageId) {
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
        const routing = await resolveDepartmentForMessage({ groupJid: item.groupJid, subject, text: item.text, mentionedJids: item.mentionedJids, existingDepartmentId: previous?.departmentId })
        // This is intentionally an explicit identity or an unambiguous CRM
        // dealer-phone match. Unknown WhatsApp participants never become
        // customer records automatically in this dealer-only CRM.
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
            update: { subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, routeType: routing.routeType, intent: routing.intent ?? null, confidence: routing.confidence ?? null, assignedUserId: routing.assignedUserId ?? current?.assignedUserId ?? null, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
            create: { userId: ownerUserId, groupJid: item.groupJid, subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, routeType: routing.routeType, intent: routing.intent ?? null, confidence: routing.confidence ?? null, assignedUserId: routing.assignedUserId ?? null, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
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
              departmentId: routing.departmentId,
              assignedUserId: routing.assignedUserId ?? current?.assignedUserId ?? undefined,
              title: subject,
              lastActivityAt: item.createdAt,
            },
            create: {
              groupId: group.id,
              dealerId: dealerMatch?.dealerId ?? null,
              dealerPhone: dealerMatch?.matchedPhone ?? null,
              ownerUserId,
              departmentId: routing.departmentId,
              assignedUserId: routing.assignedUserId ?? null,
              title: subject,
              openedAt: item.createdAt,
              lastActivityAt: item.createdAt,
            },
          })
          const ticket = await tx.evolutionGroupTicket.upsert({
            where: { groupId: group.id },
            update: { inquiryId: inquiry.id, departmentId: routing.departmentId, departmentName: routing.departmentName, assignedUserId: routing.assignedUserId ?? current?.assignedUserId ?? undefined, routeType: routing.routeType, lastIntent: routing.intent ?? null, confidence: routing.confidence ?? null },
            create: { groupId: group.id, inquiryId: inquiry.id, departmentId: routing.departmentId, departmentName: routing.departmentName, assignedUserId: routing.assignedUserId ?? null, assignedAt: routing.assignedUserId ? item.createdAt : null, routeType: routing.routeType, lastIntent: routing.intent ?? null, confidence: routing.confidence ?? null, status: 'open' },
          })
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
          const isHandoff = fromDepartmentId !== null && routing.departmentId !== null && fromDepartmentId !== routing.departmentId
          await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: message.id, inquiryId: inquiry.id, event: isHandoff ? 'HANDOFF' : 'ROUTED', routeType: routing.routeType, fromDepartmentId, toDepartmentId: routing.departmentId, confidence: routing.confidence ?? null, reason: routing.routingReason, metadata: { dealerMatch: dealerMatch?.source ?? null } } })
          const updatedGroup = await tx.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: { increment: 1 } } })
          return { message, group: updatedGroup, ticketId: ticket.id, inquiryId: inquiry.id }
        })
        const recipients = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { id: ownerUserId },
              ...(result.group.departmentId ? [{ routingDepartmentId: result.group.departmentId }] : []),
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
    }
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedEvolutionWebhook(request)) return NextResponse.json({ error: 'Invalid Evolution webhook credentials' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const ownerUserId = await getOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const incoming = extractEvolutionMessages(body)
  void processIncoming(ownerUserId, incoming).catch((error) => console.error('[evolution/webhook] processing failed:', error))
  return NextResponse.json({ ok: true, received: incoming.length, accepted: 'processing' })
}
