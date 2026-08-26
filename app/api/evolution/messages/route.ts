import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, sendEvolutionGroupMedia, sendEvolutionGroupText } from '@/lib/evolution-routing'
import { uploadFile } from '@/lib/r2'

const MAX_MEDIA_BYTES = 25 * 1024 * 1024

type MediaType = 'image' | 'document' | 'audio' | 'video'

function mediaTypeFor(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

function evolutionCanFetch(path: string): string {
  // In Compose, both containers share the internal network. This avoids
  // relying on a temporary public tunnel for an outbound WhatsApp attachment.
  const configured = process.env.EVOLUTION_MEDIA_BASE_URL?.trim()
  const internal = process.env.EVOLUTION_API_URL?.includes('://evolution:')
  const base = configured || (internal ? 'http://app:3000' : (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL))
  if (!base) throw new Error('No app URL is available for Evolution to fetch the attachment')
  return `${base.replace(/\/$/, '')}${path}`
}

async function access() {
  const session = await getSession()
  if (!session?.user) return null
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return null
  return { user: session.user, ownerId }
}

async function visibleGroup(groupId: string, user: NonNullable<Awaited<ReturnType<typeof access>>>['user'], ownerId: number) {
  const group = await prisma.evolutionGroup.findFirst({
    where: { id: groupId, userId: ownerId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, ticket: true, inquiry: true },
  })
  if (!group) return null
  if (user.role === 'STAFF' && group.departmentId !== user.routingDepartmentId) return null
  return group
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
  const groupId = new URL(request.url).searchParams.get('group_id')?.trim()
  if (!groupId) return NextResponse.json({ error: 'group_id is required' }, { status: 400 })
  const group = await visibleGroup(groupId, current.user, current.ownerId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  await prisma.evolutionGroup.update({ where: { id: group.id }, data: { unreadCount: 0 } })
  const reactions = await prisma.evolutionGroupReaction.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, targetMessageId: true, senderJid: true, senderName: true, emoji: true, createdAt: true },
  })
  return NextResponse.json({ data: group.messages, reactions })
}

export async function POST(request: Request) {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let groupId = ''
  let text = ''
  let quotedMessageId = ''
  let attachment: File | null = null

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData()
    groupId = String(form.get('group_id') || '').trim()
    text = String(form.get('text') || '').trim()
    quotedMessageId = String(form.get('quoted_message_id') || '').trim()
    const file = form.get('file')
    if (file && typeof file === 'object' && 'arrayBuffer' in file && 'size' in file) attachment = file as File
  } else {
    const body = await request.json().catch(() => ({})) as { group_id?: string; text?: string; quoted_message_id?: string }
    groupId = String(body.group_id || '').trim()
    text = String(body.text || '').trim()
    quotedMessageId = String(body.quoted_message_id || '').trim()
  }

  if (!groupId || (!text && !attachment)) return NextResponse.json({ error: 'group_id and either text or an attachment are required' }, { status: 400 })
  if (attachment && attachment.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'Attachment is too large. Maximum size is 25MB.' }, { status: 413 })
  const group = await visibleGroup(groupId, current.user, current.ownerId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  const quoted = quotedMessageId ? group.messages.find((message) => message.id === quotedMessageId) : undefined
  try {
    let mediaUrl: string | null = null
    let messageType = 'conversation'
    let response: unknown

    if (attachment) {
      const buffer = Buffer.from(await attachment.arrayBuffer())
      const mimeType = attachment.type || 'application/octet-stream'
      const mediaType = mediaTypeFor(mimeType)
      mediaUrl = await uploadFile(buffer, attachment.name || `attachment.${mediaType}`, mimeType, `evolution/outbound/${current.ownerId}`)
      response = await sendEvolutionGroupMedia({
        groupJid: group.groupJid,
        mediaUrl: evolutionCanFetch(mediaUrl),
        mediaType,
        mimeType,
        fileName: attachment.name || `attachment.${mediaType}`,
        caption: text || undefined,
        quoted: quoted ? { id: quoted.messageId, text: quoted.text } : undefined,
      })
      messageType = mediaType
    } else {
      response = await sendEvolutionGroupText({ groupJid: group.groupJid, text, quoted: quoted ? { id: quoted.messageId, text: quoted.text } : undefined })
    }

    const sentAt = new Date()
    const { message, updatedGroup } = await prisma.$transaction(async (tx) => {
      const message = await tx.evolutionGroupMessage.create({
        data: {
          groupId: group.id,
          messageId: sentMessageId(response),
          senderJid: 'me',
          senderName: current.user.name || 'CRM user',
          text: text || null,
          messageType,
          mediaUrl,
          fromMe: true,
          status: 'sent',
          quotedMessageId: quoted?.messageId || null,
        },
      })
      const updatedGroup = await tx.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: text || `[${messageType}]`, lastMessageAt: sentAt } })
      if (group.ticket) {
        await tx.evolutionGroupTicket.update({
          where: { id: group.ticket.id },
          data: { firstResponseAt: group.ticket.firstResponseAt || sentAt, lastResponseAt: sentAt, version: { increment: 1 } },
        })
        await tx.evolutionRoutingAudit.create({
          data: {
            ticketId: group.ticket.id,
            messageId: message.id,
            inquiryId: group.inquiry?.id || null,
            actorUserId: Number(current.user.id) || null,
            event: 'MANUAL_REPLY',
            routeType: 'MANUAL',
            reason: 'Team member sent a group message',
          },
        })
      }
      if (group.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: { lastActivityAt: sentAt } })
      return { message, updatedGroup }
    })
    return NextResponse.json({ data: { message, group: updatedGroup } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send group message' }, { status: 502 })
  }
}
