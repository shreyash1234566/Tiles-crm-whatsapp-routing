import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { encodeEvolutionMedia, getEvolutionOwnerUserId, sendEvolutionGroupMedia, sendEvolutionGroupText } from '@/lib/evolution-routing'
import { deleteFile, uploadFile } from '@/lib/r2'
import { canAccessDepartmentWorkItem } from '@/lib/evolution-work-items'

const MAX_MEDIA_BYTES = 25 * 1024 * 1024
type MediaType = 'image' | 'document' | 'audio' | 'video'

function mediaTypeFor(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

async function access() {
  const session = await getSession()
  if (!session?.user) return null
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return null
  return { user: session.user, ownerId }
}

async function visibleWorkItem(workItemId: string, user: NonNullable<Awaited<ReturnType<typeof access>>>['user'], ownerId: number) {
  const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({
    where: { id: workItemId, group: { userId: ownerId } },
    include: {
      group: true,
      ticket: { include: { inquiry: true } },
      messages: { include: { message: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!workItem || !canAccessDepartmentWorkItem(user, workItem)) return null
  return workItem
}

function sentMessageId(response: unknown): string {
  if (!response || typeof response !== 'object') return `crm-${Date.now()}`
  const root = response as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  return typeof key.id === 'string' && key.id ? key.id : `crm-${Date.now()}`
}

export async function GET(request: Request) {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workItemId = new URL(request.url).searchParams.get('work_item_id')?.trim()
  if (!workItemId) return NextResponse.json({ error: 'work_item_id is required' }, { status: 400 })
  const workItem = await visibleWorkItem(workItemId, current.user, current.ownerId)
  if (!workItem) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })

  await prisma.evolutionDepartmentWorkItem.update({ where: { id: workItem.id }, data: { unreadCount: 0 } })
  const providerMessageIds = workItem.messages.map((entry) => entry.message.messageId)
  const reactions = providerMessageIds.length
    ? await prisma.evolutionGroupReaction.findMany({
      where: { groupId: workItem.groupId, targetMessageId: { in: providerMessageIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, targetMessageId: true, senderJid: true, senderName: true, emoji: true, createdAt: true },
    })
    : []
  return NextResponse.json({
    data: workItem.messages.map((entry) => entry.message).filter((message) => message.messageType !== 'reactionMessage'),
    reactions,
    workItem: { id: workItem.id, groupId: workItem.groupId, departmentId: workItem.departmentId, status: workItem.status },
  })
}

export async function POST(request: Request) {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let workItemId = ''
  let text = ''
  let quotedMessageId = ''
  let attachment: File | null = null

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData()
    workItemId = String(form.get('work_item_id') || '').trim()
    text = String(form.get('text') || '').trim()
    quotedMessageId = String(form.get('quoted_message_id') || '').trim()
    const file = form.get('file')
    if (file && typeof file === 'object' && 'arrayBuffer' in file && 'size' in file) attachment = file as File
  } else {
    const body = await request.json().catch(() => ({})) as { work_item_id?: string; text?: string; quoted_message_id?: string }
    workItemId = String(body.work_item_id || '').trim()
    text = String(body.text || '').trim()
    quotedMessageId = String(body.quoted_message_id || '').trim()
  }

  if (!workItemId || (!text && !attachment)) return NextResponse.json({ error: 'work_item_id and either text or an attachment are required' }, { status: 400 })
  if (attachment && attachment.size === 0) return NextResponse.json({ error: 'Attachment is empty. Choose a non-empty file.' }, { status: 400 })
  if (attachment && attachment.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'Attachment is too large. Maximum size is 25MB.' }, { status: 413 })
  const workItem = await visibleWorkItem(workItemId, current.user, current.ownerId)
  if (!workItem) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
  if (workItem.status !== 'ACTIVE') return NextResponse.json({ error: 'This work item is Done. Reopen it before replying.' }, { status: 409 })
  const quoted = quotedMessageId ? workItem.messages.map((entry) => entry.message).find((message) => message.id === quotedMessageId) : undefined

  try {
    let mediaUrl: string | null = null
    let messageType = 'conversation'
    let response: unknown
    if (attachment) {
      const buffer = Buffer.from(await attachment.arrayBuffer())
      const mimeType = attachment.type || 'application/octet-stream'
      const mediaType = mediaTypeFor(mimeType)
      const evolutionMedia = encodeEvolutionMedia(buffer)
      try {
        // Keep the local upload solely for CRM rendering. Evolution receives
        // raw base64, which v2.3.7 accepts without relying on a Docker-only URL.
        mediaUrl = await uploadFile(buffer, attachment.name || `attachment.${mediaType}`, mimeType, `evolution/outbound/${current.ownerId}`)
        response = await sendEvolutionGroupMedia({ groupJid: workItem.group.groupJid, media: evolutionMedia, mediaType, mimeType, fileName: attachment.name || `attachment.${mediaType}`, caption: text || undefined, quoted: quoted ? { id: quoted.messageId, text: quoted.text } : undefined })
      } catch (error) {
        if (mediaUrl) await deleteFile(mediaUrl).catch(() => undefined)
        throw error
      }
      messageType = mediaType
    } else {
      response = await sendEvolutionGroupText({ groupJid: workItem.group.groupJid, text, quoted: quoted ? { id: quoted.messageId, text: quoted.text } : undefined })
    }

    const sentAt = new Date()
    const data = await prisma.$transaction(async (tx) => {
      const message = await tx.evolutionGroupMessage.create({ data: { groupId: workItem.groupId, messageId: sentMessageId(response), senderJid: 'me', senderName: current.user.name || 'CRM user', text: text || null, messageType, mediaUrl, fromMe: true, status: 'sent', quotedMessageId: quoted?.messageId || null, createdAt: sentAt } })
      await tx.evolutionDepartmentWorkItemMessage.create({ data: { workItemId: workItem.id, messageId: message.id, createdAt: sentAt } })
      const updatedWorkItem = await tx.evolutionDepartmentWorkItem.update({ where: { id: workItem.id }, data: { lastMessageText: text || `[${messageType}]`, lastMessageAt: sentAt, unreadCount: 0, version: { increment: 1 } } })
      await tx.evolutionGroup.update({ where: { id: workItem.groupId }, data: { lastMessageText: text || `[${messageType}]`, lastMessageAt: sentAt } })
      await tx.evolutionGroupTicket.update({ where: { id: workItem.ticketId }, data: { firstResponseAt: workItem.ticket.firstResponseAt || sentAt, lastResponseAt: sentAt, version: { increment: 1 } } })
      await tx.evolutionDepartmentWorkItemAudit.create({ data: { workItemId: workItem.id, messageId: message.id, actorUserId: Number(current.user.id) || null, event: 'MANUAL_REPLY', toDepartmentId: workItem.departmentId, reason: 'Team member sent a department-scoped group message' } })
      await tx.evolutionRoutingAudit.create({ data: { ticketId: workItem.ticketId, messageId: message.id, inquiryId: workItem.ticket.inquiry?.id || null, actorUserId: Number(current.user.id) || null, event: 'MANUAL_REPLY', routeType: 'MANUAL', toDepartmentId: workItem.departmentId, reason: 'Team member sent a department-scoped group message', metadata: { workItemId: workItem.id } } })
      if (workItem.ticket.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: workItem.ticket.inquiry.id }, data: { lastActivityAt: sentAt } })
      return { message, workItem: updatedWorkItem }
    })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send group message' }, { status: 502 })
  }
}
