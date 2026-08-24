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
    const subject = item.subject === item.groupJid ? (await getEvolutionGroupSubject(item.groupJid)) || item.subject : item.subject
    const existing = await prisma.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } }, select: { id: true, departmentId: true } })
    const routing = await resolveDepartmentForMessage({ groupJid: item.groupJid, subject, text: item.text, mentionedJids: item.mentionedJids, existingDepartmentId: existing?.departmentId })
    const group = await prisma.evolutionGroup.upsert({
      where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
      update: { subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
      create: { userId: ownerUserId, groupJid: item.groupJid, subject, departmentId: routing.departmentId, departmentName: routing.departmentName, routingReason: routing.routingReason, mentionPriority: routing.mentionPriority, ...(routing.mentionPriority ? { lastMentionAt: item.createdAt } : {}) },
      select: { id: true },
    })
    try {
      const message = await prisma.evolutionGroupMessage.create({ data: { groupId: group.id, messageId: item.messageId, senderJid: item.senderJid, senderName: item.senderName, text: item.text, messageType: item.messageType, mediaUrl: item.mediaUrl, quotedMessageId: item.quotedMessageId, mentionedJids: item.mentionedJids, fromMe: item.fromMe, status: item.fromMe ? 'sent' : 'received', createdAt: item.createdAt } })
      const updatedGroup = await prisma.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, ...(item.fromMe ? {} : { lastInboundAt: item.createdAt, unreadCount: { increment: 1 } }) } })
      void publishEvent('chat_events', { type: 'new_message', userId: String(ownerUserId), conversationId: group.id, payload: { group: updatedGroup, message } })
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
