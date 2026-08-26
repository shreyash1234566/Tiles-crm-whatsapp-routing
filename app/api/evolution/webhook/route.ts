import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadEvolutionMedia, isAuthorizedEvolutionWebhook, extractEvolutionMessages, getEvolutionGroupSubject, resolveDepartmentForMessage } from '@/lib/evolution-routing'
import { publishEvent } from '@/lib/redis'
import { uploadFile } from '@/lib/r2'
import { calculateSLADueDates } from '@/lib/routing/sla'

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
    if (item.fromMe) continue

    try {
      await withGroupLock(`${ownerUserId}:${item.groupJid}`, async () => {
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
        const routingMatches = await resolveDepartmentForMessage({ groupJid: item.groupJid, subject, text: item.text, mentionedJids: item.mentionedJids })
        const result = await prisma.$transaction(async (tx) => {
          const group = await tx.evolutionGroup.upsert({
            where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
            update: { subject, lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: { increment: 1 } },
            create: { userId: ownerUserId, groupJid: item.groupJid, subject, lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: 1 },
          })
          const ticket = await tx.evolutionGroupTicket.upsert({
            where: { groupId: group.id },
            update: { status: 'open' },
            create: { groupId: group.id, status: 'open' },
          })

          for (const match of routingMatches) {
            if (!match.departmentId) continue
            
            const workItem = await tx.departmentWorkItem.upsert({
              where: { ticketId_departmentId_sourceMessageId: { ticketId: ticket.id, departmentId: match.departmentId, sourceMessageId: item.messageId } },
              update: {},
              create: {
                ticketId: ticket.id,
                departmentId: match.departmentId,
                departmentName: match.departmentName,
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
          return { message, group, routingMatches }
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
