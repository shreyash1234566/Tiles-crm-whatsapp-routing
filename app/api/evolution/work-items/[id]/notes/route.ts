import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { publishEvent } from '@/lib/redis'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const workItem = await prisma.departmentWorkItem.findUnique({
    where: { id },
    include: { ticket: true }
  })

  if (!workItem) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })

  if (session.user.role === 'STAFF' && workItem.departmentId !== session.user.routingDepartmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const notes = await prisma.evolutionGroupNote.findMany({
    where: { workItemId: id },
    include: {
      user: {
        select: { id: true, name: true, role: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  })

  return NextResponse.json({ data: notes })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const workItem = await prisma.departmentWorkItem.findUnique({
    where: { id },
    include: { ticket: true }
  })

  if (!workItem) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })

  if (session.user.role === 'STAFF' && workItem.departmentId !== session.user.routingDepartmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { content?: string }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const note = await prisma.evolutionGroupNote.create({
    data: {
      content: body.content,
      userId: Number(session.user.id),
      ticketId: workItem.ticketId,
      workItemId: id,
      isInternal: true
    },
    include: {
        user: { select: { id: true, name: true, role: true } }
    }
  })

  // We notify department members of the new note for real-time syncing
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ['ADMIN', 'MANAGER'] } },
        { routingDepartmentId: workItem.departmentId }
      ]
    },
    select: { id: true }
  })

  void publishEvent('chat_events', {
    type: 'new_note',
    userId: session.user.id.toString(),
    userIds: recipients.map((r) => String(r.id)),
    conversationId: workItem.id, // Depending on frontend expectation, might want to send workItemId
    payload: { note, workItemId: id }
  })

  return NextResponse.json({ data: note })
}
