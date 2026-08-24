import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isAuthorizedEvolutionWebhook, extractEvolutionMessages, getEvolutionGroupSubject, resolveDepartmentForMessage } from '@/lib/evolution-routing'
import { publishEvent } from '@/lib/redis'

async function getOwnerUserId(): Promise<number | null> {
  const configured = Number(process.env.EVOLUTION_OWNER_USER_ID)
  if (Number.isInteger(configured) && configured > 0) return configured
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { id: 'asc' }, select: { id: true } })
  return owner?.id ?? null
}

async function processIncoming(ownerUserId: number, incoming: ReturnType<typeof extractEvolutionMessages>) {
  for (const item of incoming) {
    try {
      const subject = item.subject === item.groupJid ? (await getEvolutionGroupSubject(item.groupJid)) || item.subject : item.subject
      const previous = await prisma.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } }, select: { departmentId: true } })
      const routing = await resolveDepartmentForMessage({ groupJid: item.groupJid, subject, text: item.text, mentionedJids: item.mentionedJids, existingDepartmentId: previous?.departmentId })
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } }, select: { id: true, departmentId: true } })
        const fromDepartmentId = current?.departmentId ?? null
        const group = await tx.evolutionGroup.upsert({
          where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
          update: { subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, routeType: routing.routeType, intent: routing.intent ?? null, confidence: routing.confidence ?? null, assignedUserId: routing.assignedUserId ?? null, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
          create: { userId: ownerUserId, groupJid: item.groupJid, subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, routeType: routing.routeType, intent: routing.intent ?? null, confidence: routing.confidence ?? null, assignedUserId: routing.assignedUserId ?? null, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
        })
        const ticket = await tx.evolutionGroupTicket.upsert({
          where: { groupId: group.id },
          update: { departmentId: routing.departmentId, departmentName: routing.departmentName, assignedUserId: routing.assignedUserId ?? null, routeType: routing.routeType, lastIntent: routing.intent ?? null, confidence: routing.confidence ?? null, status: 'open' },
          create: { groupId: group.id, departmentId: routing.departmentId, departmentName: routing.departmentName, assignedUserId: routing.assignedUserId ?? null, routeType: routing.routeType, lastIntent: routing.intent ?? null, confidence: routing.confidence ?? null, status: 'open' },
        })
        const message = await tx.evolutionGroupMessage.create({ data: { groupId: group.id, messageId: item.messageId, senderJid: item.senderJid, senderName: item.senderName, text: item.text, messageType: item.messageType, mediaUrl: item.mediaUrl, quotedMessageId: item.quotedMessageId, mentionedJids: item.mentionedJids, fromMe: item.fromMe, status: item.fromMe ? 'sent' : 'received', createdAt: item.createdAt } })
        const isHandoff = fromDepartmentId !== null && routing.departmentId !== null && fromDepartmentId !== routing.departmentId
        await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: message.id, event: isHandoff ? 'HANDOFF' : 'ROUTED', routeType: routing.routeType, fromDepartmentId, toDepartmentId: routing.departmentId, confidence: routing.confidence ?? null, reason: routing.routingReason } })
        const updatedGroup = await tx.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, ...(item.fromMe ? {} : { lastInboundAt: item.createdAt, unreadCount: { increment: 1 } }) } })
        return { message, group: updatedGroup }
      })
      void publishEvent('chat_events', { type: 'new_message', userId: String(ownerUserId), conversationId: result.group.id, payload: result })
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
