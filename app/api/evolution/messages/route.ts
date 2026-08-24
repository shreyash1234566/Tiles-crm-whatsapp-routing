import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, sendEvolutionGroupText } from '@/lib/evolution-routing'

async function access() {
  const session = await getSession()
  if (!session?.user) return null
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return null
  return { user: session.user, ownerId }
}

async function visibleGroup(groupId: string, user: NonNullable<Awaited<ReturnType<typeof access>>>['user'], ownerId: number) {
  const group = await prisma.evolutionGroup.findFirst({ where: { id: groupId, userId: ownerId }, include: { messages: { orderBy: { createdAt: 'asc' } } } })
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
  return NextResponse.json({ data: group.messages })
}

export async function POST(request: Request) {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { group_id?: string; text?: string; quoted_message_id?: string }
  const groupId = String(body.group_id || '').trim()
  const text = String(body.text || '').trim()
  if (!groupId || !text) return NextResponse.json({ error: 'group_id and text are required' }, { status: 400 })
  const group = await visibleGroup(groupId, current.user, current.ownerId)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  const quoted = body.quoted_message_id ? group.messages.find((message) => message.id === body.quoted_message_id) : undefined
  try {
    const response = await sendEvolutionGroupText({ groupJid: group.groupJid, text, quoted: quoted ? { id: quoted.messageId, text: quoted.text } : undefined })
    const message = await prisma.evolutionGroupMessage.create({
      data: {
        groupId: group.id,
        messageId: sentMessageId(response),
        senderJid: 'me',
        senderName: current.user.name || 'CRM user',
        text,
        messageType: 'conversation',
        fromMe: true,
        status: 'sent',
        quotedMessageId: quoted?.messageId || null,
      },
    })
    const updatedGroup = await prisma.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: text, lastMessageAt: new Date() } })
    return NextResponse.json({ data: { message, group: updatedGroup } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send group message' }, { status: 502 })
  }
}
