import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { publishEvent } from '@/lib/redis'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const claimantId = Number(session.user.id)
  if (!Number.isInteger(claimantId) || claimantId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerId }, include: { ticket: true } })
  if (!group || (session.user.role === 'STAFF' && group.departmentId !== session.user.routingDepartmentId)) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { action?: string; departmentId?: number }

  if (body.action === 'transfer') {
    if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const toDepartmentId = body.departmentId
    if (!toDepartmentId) return NextResponse.json({ error: 'Target department ID required' }, { status: 400 })
    const department = await prisma.routingDepartment.findFirst({ where: { id: toDepartmentId, isActive: true }, select: { id: true, name: true } })
    if (!department) return NextResponse.json({ error: 'Invalid or inactive department' }, { status: 400 })

    const fromDepartmentId = group.departmentId
    if (fromDepartmentId === department.id) return NextResponse.json({ error: 'Group is already in this department' }, { status: 400 })

    const isHandoff = fromDepartmentId !== null && fromDepartmentId !== department.id

    // Create Audit if there's a ticket attached, else we just create one standalone
    const auditData = {
      event: isHandoff ? 'HANDOFF' : 'ROUTED',
      routeType: 'MANUAL',
      fromDepartmentId,
      toDepartmentId: department.id,
      confidence: 1, // Manual override is 100%
      reason: `Manual transfer by ${session.user.name} (${session.user.role})`,
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (group.ticket) {
        await tx.evolutionRoutingAudit.create({ data: { ...auditData, ticketId: group.ticket.id, messageId: 'manual' } })
      }
      return tx.evolutionGroup.update({
        where: { id },
        data: { departmentId: department.id, departmentName: department.name, routingReason: auditData.reason, claimedByUserId: null, claimedAt: null }
      })
    })

    // Notify users
    const recipients = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { id: ownerId },
          ...(fromDepartmentId ? [{ routingDepartmentId: fromDepartmentId }] : []),
          { routingDepartmentId: department.id },
        ],
      },
      select: { id: true },
    })

    void publishEvent('chat_events', {
      type: 'conversation_update',
      userId: String(ownerId),
      userIds: recipients.map((r) => String(r.id)),
      conversationId: updated.id,
      payload: { group: updated },
    })

    return NextResponse.json({ data: updated })
  }

  const updated = await prisma.evolutionGroup.update({
    where: { id },
    data: body.action === 'release'
      ? { claimedByUserId: null, claimedAt: null }
      : { claimedByUserId: claimantId, claimedAt: new Date() },
  })

  // Basic claim/release notification
  const claimRecipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { id: ownerId },
        ...(group.departmentId ? [{ routingDepartmentId: group.departmentId }] : []),
      ],
    },
    select: { id: true },
  })
  void publishEvent('chat_events', {
    type: 'conversation_update',
    userId: String(ownerId),
    userIds: claimRecipients.map((r) => String(r.id)),
    conversationId: updated.id,
    payload: { group: updated },
  })


  return NextResponse.json({ data: updated })
}
