import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { EvolutionApiError, getEvolutionOwnerUserId, sendEvolutionGroupMediaUrl, sendEvolutionGroupText } from '@/lib/evolution-routing'
import { canAccessDepartmentWorkItem, isRoutingManager, workItemRecipientIds } from '@/lib/evolution-work-items'
import { publishEvent } from '@/lib/redis'
import { EvolutionSafetyBlockedError } from '@/lib/evolution-safety'

function providerMessageId(value: unknown): string {
  if (!value || typeof value !== 'object') return `catalog-${Date.now()}`
  const root = value as Record<string, unknown>; const key = root.key as Record<string, unknown> | undefined; const data = root.data as Record<string, unknown> | undefined
  const nestedKey = data?.key as Record<string, unknown> | undefined
  return (typeof key?.id === 'string' && key.id) || (typeof nestedKey?.id === 'string' && nestedKey.id) || `catalog-${Date.now()}`
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const draft = await prisma.evolutionCatalogResponseDraft.findFirst({ where: { id, userId: ownerId }, include: { group: { include: { ticket: true, inquiry: true } } } })
  if (!draft?.group.ticket) return NextResponse.json({ error: 'Catalog draft or its routed group was not found' }, { status: 404 })
  const ticket = draft.group.ticket
  if (!isRoutingManager(session.user)) {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({ where: { ticketId: ticket.id, departmentId: session.user.routingDepartmentId ?? -1, status: 'ACTIVE' }, select: { departmentId: true, assignedUserId: true, claimedByUserId: true } })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This group is not available to your department' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({})) as { action?: unknown; rejectionReason?: unknown }
  const action = String(body.action || '').toLowerCase()
  const actorUserId = Number(session.user.id)
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })

  if (action === 'approve' || action === 'reject') {
    if (!isRoutingManager(session.user)) return NextResponse.json({ error: 'Only an admin or manager can approve or reject catalog responses' }, { status: 403 })
    const rejectionReason = String(body.rejectionReason || '').trim().slice(0, 800)
    if (action === 'reject' && !rejectionReason) return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 })
    const changed = await prisma.evolutionCatalogResponseDraft.updateMany({ where: { id: draft.id, status: 'DRAFT' }, data: action === 'approve' ? { status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: new Date() } : { status: 'REJECTED', approvedByUserId: actorUserId, approvedAt: new Date(), rejectionReason } })
    if (changed.count !== 1) return NextResponse.json({ error: 'This draft is no longer awaiting approval; refresh first' }, { status: 409 })
    return NextResponse.json({ data: await prisma.evolutionCatalogResponseDraft.findUniqueOrThrow({ where: { id: draft.id } }) })
  }

  if (action !== 'send') return NextResponse.json({ error: 'action must be approve, reject, or send' }, { status: 400 })
  // A send can only claim an already approved draft once. SENDING protects
  // against duplicate clicks while Evolution is processing the request.
  const claimed = await prisma.evolutionCatalogResponseDraft.updateMany({ where: { id: draft.id, status: 'APPROVED' }, data: { status: 'SENDING' } })
  if (claimed.count !== 1) return NextResponse.json({ error: 'Only an approved, unsent draft can be sent' }, { status: 409 })
  // Re-read immediately after atomically claiming the draft. The initial
  // lookup can be stale when a manager closes the ticket in another tab.
  const currentTicket = await prisma.evolutionGroupTicket.findUnique({ where: { id: ticket.id }, select: { status: true, stage: true, firstResponseAt: true } })
  if (!currentTicket || currentTicket.status !== 'open') {
    await prisma.evolutionCatalogResponseDraft.update({ where: { id: draft.id }, data: { status: 'APPROVED' } })
    return NextResponse.json({ error: 'The group ticket is closed; catalog responses cannot be sent' }, { status: 409 })
  }
  let providerCallStarted = false
  let providerMessageAccepted = false
  try {
    providerCallStarted = true
    const providerResponse = await sendEvolutionGroupText({ groupJid: draft.group.groupJid, text: draft.content, quoted: draft.requestedMessageId ? { id: draft.requestedMessageId, text: null } : undefined, ownerUserId: ownerId, category: 'CATALOG', idempotencyKey: `evolution-catalog:${draft.id}:text`, metadata: { draftId: draft.id } })
    providerMessageAccepted = true
    const sentMedia: Array<{ providerId: string; url: string; type: 'image' | 'video' | 'document' }> = []
    for (let index = 0; index < draft.mediaUrls.length; index += 1) {
      const url = draft.mediaUrls[index]
      const type = draft.mediaTypes[index] === 'video' ? 'video' : draft.mediaTypes[index] === 'document' ? 'document' : 'image'
      const extension = type === 'video' ? 'mp4' : type === 'document' ? 'pdf' : 'jpg'
      providerCallStarted = true
      const response = await sendEvolutionGroupMediaUrl({ groupJid: draft.group.groupJid, mediaUrl: url, mediaType: type, mimeType: type === 'video' ? 'video/mp4' : type === 'document' ? 'application/pdf' : 'image/jpeg', fileName: `catalog-${index + 1}.${extension}`, quoted: index === 0 && draft.requestedMessageId ? { id: draft.requestedMessageId, text: null } : undefined, ownerUserId: ownerId, category: 'CATALOG', idempotencyKey: `evolution-catalog:${draft.id}:media:${index}`, metadata: { draftId: draft.id, mediaIndex: index } })
      providerMessageAccepted = true
      sentMedia.push({ providerId: providerMessageId(response), url, type })
    }
    const sentAt = new Date(); const outboundMessageId = providerMessageId(providerResponse)
    const data = await prisma.$transaction(async (tx) => {
      const message = await tx.evolutionGroupMessage.create({ data: { groupId: draft.groupId, messageId: outboundMessageId, senderJid: 'crm-catalog', senderName: session.user.name || 'Catalog team', text: draft.content, messageType: 'conversation', fromMe: true, status: 'sent', quotedMessageId: draft.requestedMessageId || null } })
      const workItems = await tx.evolutionDepartmentWorkItem.findMany({ where: { ticketId: ticket.id, status: 'ACTIVE' }, select: { id: true } })
      await Promise.all(workItems.map((workItem) => tx.evolutionDepartmentWorkItemMessage.create({ data: { workItemId: workItem.id, messageId: message.id, createdAt: sentAt } })))
      for (const media of sentMedia) {
        const mediaMessage = await tx.evolutionGroupMessage.create({ data: { groupId: draft.groupId, messageId: media.providerId, senderJid: 'crm-catalog', senderName: session.user.name || 'Catalog team', text: null, messageType: media.type, mediaUrl: media.url, fromMe: true, status: 'sent', quotedMessageId: draft.requestedMessageId || null, createdAt: sentAt } })
        await Promise.all(workItems.map((workItem) => tx.evolutionDepartmentWorkItemMessage.create({ data: { workItemId: workItem.id, messageId: mediaMessage.id, createdAt: sentAt } })))
      }
      await tx.evolutionGroup.update({ where: { id: draft.groupId }, data: { lastMessageText: draft.content.slice(0, 1_000), lastMessageAt: sentAt } })
      await tx.evolutionGroupTicket.update({ where: { id: ticket.id }, data: { firstResponseAt: currentTicket.firstResponseAt || sentAt, lastResponseAt: sentAt, version: { increment: 1 } } })
      if (draft.group.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: draft.group.inquiry.id }, data: { lastActivityAt: sentAt } })
      const updatedDraft = await tx.evolutionCatalogResponseDraft.update({ where: { id: draft.id }, data: { status: 'SENT', sentAt, providerMessageId: outboundMessageId } })
      await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: message.id, inquiryId: draft.group.inquiry?.id || null, actorUserId, event: 'CATALOG_RESPONSE_SENT', routeType: 'CATALOG', reason: 'Approved dealer-shareable catalog response sent', metadata: { catalogDraftId: draft.id, catalogItemIds: draft.catalogItemIds, providerMessageId: outboundMessageId } } })
      return { updatedDraft, message }
    })
    const workItems = await prisma.evolutionDepartmentWorkItem.findMany({ where: { ticketId: ticket.id, status: 'ACTIVE' }, select: { id: true, departmentId: true, assignedUserId: true } })
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, routingDepartmentId: true } })
    const recipientIds = new Set<number>()
    for (const workItem of workItems) for (const userId of workItemRecipientIds(users, workItem.departmentId, workItem.assignedUserId)) recipientIds.add(userId)
    void publishEvent('chat_events', { type: 'new_message', userId: String(ownerId), userIds: [...recipientIds].map(String), conversationId: draft.groupId, payload: { message: data.message } })
    return NextResponse.json({ data: data.updatedDraft })
  } catch (error) {
    // A provider/network failure after one message was accepted is ambiguous:
    // resetting to APPROVED would let a retry duplicate the dealer reply.
    // Only a definitive Evolution HTTP rejection before any acceptance is
    // safely retryable. Unknown failures remain FAILED for manual inspection.
    const definitelyRejected = error instanceof EvolutionSafetyBlockedError || (error instanceof EvolutionApiError && !providerMessageAccepted)
    const uncertain = providerMessageAccepted || (providerCallStarted && !definitelyRejected)
    await prisma.evolutionCatalogResponseDraft.update({
      where: { id: draft.id },
      data: uncertain
        ? { status: 'FAILED', rejectionReason: 'Provider send may have succeeded; verify the WhatsApp group before retrying.' }
        : { status: 'APPROVED' },
    })
    const message = error instanceof Error ? error.message.slice(0, 1_000) : 'Evolution rejected the catalog response'
    return NextResponse.json({ error: uncertain ? `${message}. The draft was held as FAILED to prevent duplicate sends.` : `${message}. The approved draft was retained.` }, { status: 502 })
  }
}
