import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadEvolutionMedia, isAuthorizedEvolutionWebhook, extractEvolutionMessages, extractEvolutionMessageStatusUpdates, getEvolutionGroupSubject, resolveDepartmentForMessage } from '@/lib/evolution-routing'
import { randomUUID } from 'node:crypto'
import { publishEvent } from '@/lib/redis'
import { uploadFile } from '@/lib/r2'
import { findDealerForEvolutionMessage, normalizeEvolutionPhone } from '@/lib/evolution-operations'
import { getEvolutionAgentQueue, getEvolutionVisionQueue } from '@/lib/queues/jobs'
import { isEvolutionVisionEnabled } from '@/lib/evolution-vision'
import { workItemRecipientIds } from '@/lib/evolution-work-items'
import { createCatalogDraftForInbound } from '@/lib/evolution-catalog-workflow'
import { isEvolutionMarketingOptOut } from '@/lib/evolution-safety'

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
            select: { id: true },
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
          const itemScopes = await prisma.evolutionDepartmentWorkItem.findMany({
            where: { groupId: group.id, messages: { some: { message: { messageId: item.reactionTargetMessageId } } } },
            select: { id: true, departmentId: true, assignedUserId: true },
          })
          const eligibleUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, routingDepartmentId: true } })
          const recipientIds = new Set<number>()
          for (const scope of itemScopes) {
            for (const id of workItemRecipientIds(eligibleUsers, scope.departmentId, scope.assignedUserId)) recipientIds.add(id)
          }
          void publishEvent('chat_events', {
            type: 'reaction_update', userId: String(ownerUserId), userIds: [...recipientIds].map(String), conversationId: group.id,
            payload: { targetMessageId: item.reactionTargetMessageId, emoji: item.reactionEmoji, senderJid: item.senderJid, workItemIds: itemScopes.map((scope) => scope.id) },
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
        // A WhatsApp group also contains our own staff. Only treat STOP as a
        // dealer opt-out when the sender is the explicitly linked dealer
        // number (or the sender produced the initial exact CRM phone match).
        // This prevents an employee's group message from disabling consent.
        const savedIdentity = await prisma.dealerEvolutionIdentity.findUnique({
          where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
          select: { phone: true },
        })
        const senderPhone = normalizeEvolutionPhone(item.senderJid)
        const verifiedDealerSender = Boolean(
          senderPhone && (
            (savedIdentity?.phone && normalizeEvolutionPhone(savedIdentity.phone) === senderPhone)
            || (!savedIdentity && dealerMatch?.source === 'dealer_phone')
          ),
        )
        const marketingOptOut = verifiedDealerSender && isEvolutionMarketingOptOut(item.text)
        const result = await prisma.$transaction(async (tx) => {
          const group = await tx.evolutionGroup.upsert({
            where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
            // The parent group is retained for compatibility and global group
            // metadata only. Its department is deliberately not overwritten:
            // each routed responsibility belongs to a separate work item.
            update: { subject, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
            create: { userId: ownerUserId, groupJid: item.groupJid, subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, routeType: routing.routeType, intent: routing.intent ?? null, confidence: routing.confidence ?? null, assignedUserId: routing.assignedUserId ?? null, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
          })
          if (dealerMatch) {
            await tx.dealerEvolutionIdentity.upsert({
              where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
              update: { dealerId: dealerMatch.dealerId, phone: dealerMatch.matchedPhone, lastSeenAt: item.createdAt },
              create: { userId: ownerUserId, dealerId: dealerMatch.dealerId, groupJid: item.groupJid, phone: dealerMatch.matchedPhone, lastSeenAt: item.createdAt },
            })
          }
          if (marketingOptOut) {
            await tx.dealerEvolutionIdentity.updateMany({
              where: { userId: ownerUserId, groupJid: item.groupJid },
              data: { marketingConsentStatus: 'OPTED_OUT', marketingOptInAt: null, marketingOptOutAt: item.createdAt, consentSource: 'DEALER_WHATSAPP_REPLY', consentEvidence: item.text?.slice(0, 1_000) || 'Dealer requested that campaign messages stop' },
            })
          }
          const inquiry = await tx.evolutionDealerInquiry.upsert({
            where: { groupId: group.id },
            update: {
              ...(dealerMatch ? { dealerId: dealerMatch.dealerId, dealerPhone: dealerMatch.matchedPhone } : {}),
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
            update: { inquiryId: inquiry.id },
            create: { groupId: group.id, inquiryId: inquiry.id, departmentId: routing.departmentId, departmentName: routing.departmentName, assignedUserId: routing.assignedUserId ?? null, assignedAt: routing.assignedUserId ? item.createdAt : null, routeType: routing.routeType, lastIntent: routing.intent ?? null, confidence: routing.confidence ?? null, status: 'open' },
          })
          const message = await tx.evolutionGroupMessage.create({ data: { groupId: group.id, messageId: item.messageId, senderJid: item.senderJid, senderName: item.senderName, text: item.text, messageType: item.messageType, mediaUrl: storedMediaUrl, quotedMessageId: item.quotedMessageId, mentionedJids: item.mentionedJids, fromMe: false, status: 'received', createdAt: item.createdAt } })
          const existingWorkItem = await tx.evolutionDepartmentWorkItem.findFirst({
            where: { ticketId: ticket.id, departmentId: routing.departmentId, status: 'ACTIVE' },
            orderBy: { updatedAt: 'desc' },
          })
          const workItem = existingWorkItem
            ? await tx.evolutionDepartmentWorkItem.update({
              where: { id: existingWorkItem.id },
              data: {
                ...(routing.assignedUserId ? { assignedUserId: routing.assignedUserId } : {}),
                routingReason: routing.routingReason,
                routeType: routing.routeType,
                intent: routing.intent ?? null,
                confidence: routing.confidence ?? null,
                mentionPriority: routing.mentionPriority,
                lastMessageText: item.text || `[${item.messageType}]`,
                lastMessageAt: item.createdAt,
                unreadCount: { increment: 1 },
                version: { increment: 1 },
              },
            })
            : await tx.evolutionDepartmentWorkItem.create({
              data: {
                groupId: group.id,
                ticketId: ticket.id,
                departmentId: routing.departmentId,
                departmentName: routing.departmentName,
                assignedUserId: routing.assignedUserId ?? null,
                routingReason: routing.routingReason,
                routeType: routing.routeType,
                intent: routing.intent ?? null,
                confidence: routing.confidence ?? null,
                mentionPriority: routing.mentionPriority,
                lastMessageText: item.text || `[${item.messageType}]`,
                lastMessageAt: item.createdAt,
                unreadCount: 1,
              },
            })
          await tx.evolutionDepartmentWorkItemMessage.create({ data: { workItemId: workItem.id, messageId: message.id, createdAt: item.createdAt } })
          await tx.evolutionDepartmentWorkItemAudit.create({
            data: {
              workItemId: workItem.id,
              messageId: message.id,
              event: existingWorkItem ? 'MESSAGE_ROUTED' : 'CREATED',
              toDepartmentId: routing.departmentId,
              reason: routing.routingReason,
              metadata: { routeType: routing.routeType, webhookMessageId: item.messageId, correlationId },
            },
          })
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
          await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: message.id, inquiryId: inquiry.id, event: marketingOptOut ? 'CAMPAIGN_OPT_OUT' : 'ROUTED', routeType: routing.routeType, fromDepartmentId: null, toDepartmentId: routing.departmentId, confidence: routing.confidence ?? null, reason: marketingOptOut ? 'Dealer opted out of campaign messages from the WhatsApp group' : routing.routingReason, correlationId, metadata: { dealerMatch: dealerMatch?.source ?? null, webhookMessageId: item.messageId, workItemId: workItem.id, marketingOptOut } } })
          const updatedGroup = await tx.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: { increment: 1 } } })
          return { message, group: updatedGroup, ticketId: ticket.id, inquiryId: inquiry.id, workItem }
        })
        const eligibleUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, routingDepartmentId: true } })
        const recipientIds = workItemRecipientIds(eligibleUsers, result.workItem.departmentId, result.workItem.assignedUserId)
        void publishEvent('chat_events', {
          type: 'new_message',
          userId: String(ownerUserId),
          userIds: recipientIds.map(String),
          conversationId: result.workItem.id,
          payload: { ...result, workItemId: result.workItem.id, departmentId: result.workItem.departmentId },
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

        // Optional local visual search is opt-in and dealer-only. It creates
        // human-review suggestions after the media is stored; it never sends
        // a product reply or reserves stock automatically.
        if (item.mediaType === 'image' && storedMediaUrl && dealerMatch && isEvolutionVisionEnabled() && process.env.EVOLUTION_VISION_AUTO_MATCH === 'true') {
          void getEvolutionVisionQueue().add('match-group-image', {
            ownerUserId,
            groupId: result.group.id,
            requestedMessageId: result.message.messageId,
            sourceUrl: storedMediaUrl,
          }, { jobId: `vision-match:${result.group.id}:${result.message.messageId}` }).catch((error) => {
            console.error('[evolution/webhook] unable to enqueue local image match:', error)
          })
        }

        // An exact catalog code only produces an approval-gated draft. No
        // automated Evolution message or inventory reservation occurs here.
        void createCatalogDraftForInbound({
          ownerUserId,
          groupId: result.group.id,
          ticketId: result.ticketId,
          inquiryId: result.inquiryId,
          providerMessageId: result.message.messageId,
          text: result.message.text,
        }).catch((error) => {
          console.error('[evolution/webhook] unable to prepare catalog draft:', error)
        })

        // Create user-scoped notifications for each recipient locally since recipients and result exist now
        await Promise.all(recipientIds.map((uId) =>
          prisma.notification.create({
            data: {
              userId: uId,
              type: 'whatsapp',
              title: item.senderName || item.senderJid.split('@')[0] || 'WhatsApp Group',
              subtitle: item.text ? (item.text.length > 50 ? item.text.substring(0, 50) + '...' : item.text) : 'New message in Group',
              href: '/routing-crm?work_item_id=' + result.workItem.id,
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
  const eventKey = event.toUpperCase().replace(/[.\-]/g, '_')
  if (eventKey === 'CONNECTION_UPDATE') {
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
    const instance = data.instance && typeof data.instance === 'object' ? data.instance as Record<string, unknown> : {}
    const connectionState = String(data.state || data.status || instance.state || '').trim().toLowerCase()
    if (['close', 'closed', 'disconnected', 'logged_out', 'logout'].includes(connectionState)) {
      await prisma.evolutionSafetyConfig.upsert({
        where: { userId: ownerUserId },
        create: { userId: ownerUserId, circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000), circuitReason: `Connection state: ${connectionState}` },
        update: { circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000), circuitReason: `Connection state: ${connectionState}` },
      }).catch(() => undefined)
    } else if (['open', 'connected'].includes(connectionState)) {
      const safety = await prisma.evolutionSafetyConfig.findUnique({ where: { userId: ownerUserId }, select: { circuitReason: true } }).catch(() => null)
      if (safety?.circuitReason?.startsWith('Connection state:')) await prisma.evolutionSafetyConfig.update({ where: { userId: ownerUserId }, data: { circuitOpenUntil: null, circuitReason: null, consecutiveFailures: 0 } }).catch(() => undefined)
    }
  }
  await prisma.evolutionWebhookHealth.upsert({
    where: { ownerUserId },
    update: { lastReceivedAt: new Date(), lastEvent: event, lastMessageId: incoming[0]?.messageId || statusUpdates[0]?.messageId || null, lastCorrelationId: correlationId, lastError: null },
    create: { ownerUserId, lastReceivedAt: new Date(), lastEvent: event, lastMessageId: incoming[0]?.messageId || statusUpdates[0]?.messageId || null, lastCorrelationId: correlationId },
  }).catch((error) => console.error('[evolution/webhook] heartbeat update failed:', error))
  void processIncoming(ownerUserId, incoming, correlationId).catch((error) => console.error('[evolution/webhook] processing failed:', error))
  void processProviderStatusUpdates(ownerUserId, statusUpdates).catch((error) => console.error('[evolution/webhook] campaign status processing failed:', error))
  return NextResponse.json({ ok: true, received: incoming.length, statusUpdates: statusUpdates.length, correlationId, accepted: 'processing' })
}
