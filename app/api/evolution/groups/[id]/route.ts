import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { publishEvent } from '@/lib/redis'

type GroupAction = 'claim' | 'release' | 'transfer'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'STAFF') return NextResponse.json({ error: 'Use department work-item actions for staff inbox work' }, { status: 403 })
  const actorUserId = Number(session.user.id)
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })

  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const group = await prisma.evolutionGroup.findFirst({
    where: { id, userId: ownerId },
    include: { ticket: true, inquiry: true },
  })
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({})) as { action?: string; departmentId?: number; expectedVersion?: number }
  const action = String(body.action || '').toLowerCase() as GroupAction
  if (!['claim', 'release', 'transfer'].includes(action)) return NextResponse.json({ error: 'action must be claim, release, or transfer' }, { status: 400 })
  const isManager = ['ADMIN', 'MANAGER'].includes(session.user.role)
  if (action === 'transfer' && !isManager) return NextResponse.json({ error: 'Only an admin or manager can transfer a group' }, { status: 403 })
  if (action === 'claim' && group.claimedByUserId && group.claimedByUserId !== actorUserId) {
    return NextResponse.json({ error: 'This group is already claimed by another team member' }, { status: 409 })
  }
  if (action === 'release' && group.claimedByUserId && group.claimedByUserId !== actorUserId && !isManager) {
    return NextResponse.json({ error: 'Only the claimant or a manager can release this group' }, { status: 403 })
  }
  if (body.expectedVersion != null && (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1)) {
    return NextResponse.json({ error: 'expectedVersion must be a positive integer' }, { status: 400 })
  }
  if (body.expectedVersion != null && group.ticket && group.ticket.version !== body.expectedVersion) {
    return NextResponse.json({ error: 'This group changed; refresh before updating it', currentVersion: group.ticket.version }, { status: 409 })
  }

  let department: { id: number; name: string } | null = null
  if (action === 'transfer') {
    const departmentId = Number(body.departmentId)
    if (!Number.isInteger(departmentId) || departmentId <= 0) return NextResponse.json({ error: 'A target department is required' }, { status: 400 })
    department = await prisma.routingDepartment.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } })
    if (!department) return NextResponse.json({ error: 'Invalid or inactive department' }, { status: 400 })
    if (group.departmentId === department.id) return NextResponse.json({ error: 'Group is already in this department' }, { status: 400 })
  }

  const now = new Date()
  const fromDepartmentId = group.departmentId
  const updated = await prisma.$transaction(async (tx) => {
    let ticket = group.ticket
    if (!ticket) {
      ticket = await tx.evolutionGroupTicket.create({
        data: { groupId: group.id, departmentId: group.departmentId, departmentName: group.departmentName, assignedUserId: group.assignedUserId, assignedAt: group.assignedUserId ? now : null, routeType: group.routeType },
      })
    }

    if (action === 'transfer' && department) {
      const reason = `Manual transfer by ${session.user.name || 'team member'} (${session.user.role})`
      const updatedGroup = await tx.evolutionGroup.update({
        where: { id: group.id },
        data: { departmentId: department.id, departmentName: department.name, assignedUserId: null, routingReason: reason, routeType: 'MANUAL', claimedByUserId: null, claimedAt: null },
      })
      await tx.evolutionGroupTicket.update({
        where: { id: ticket.id },
        data: { departmentId: department.id, departmentName: department.name, assignedUserId: null, assignedAt: null, routeType: 'MANUAL', version: { increment: 1 } },
      })
      if (group.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: { departmentId: department.id, assignedUserId: null, lastActivityAt: now } })
      await tx.evolutionRoutingAudit.create({
        data: { ticketId: ticket.id, messageId: 'manual', inquiryId: group.inquiry?.id || null, actorUserId, event: fromDepartmentId == null ? 'ROUTED' : 'HANDOFF', routeType: 'MANUAL', fromDepartmentId, toDepartmentId: department.id, confidence: 1, reason },
      })
      return updatedGroup
    }

    const isClaim = action === 'claim'
    const updatedGroup = await tx.evolutionGroup.update({
      where: { id: group.id },
      data: isClaim
        ? { claimedByUserId: actorUserId, claimedAt: now, assignedUserId: actorUserId }
        : { claimedByUserId: null, claimedAt: null, assignedUserId: null },
    })
    await tx.evolutionGroupTicket.update({
      where: { id: ticket.id },
      data: isClaim
        ? { assignedUserId: actorUserId, assignedAt: now, version: { increment: 1 } }
        : { assignedUserId: null, assignedAt: null, version: { increment: 1 } },
    })
    if (group.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: { assignedUserId: isClaim ? actorUserId : null, lastActivityAt: now } })
    await tx.evolutionRoutingAudit.create({
      data: { ticketId: ticket.id, messageId: 'manual', inquiryId: group.inquiry?.id || null, actorUserId, event: isClaim ? 'CLAIMED' : 'RELEASED', routeType: 'MANUAL', fromDepartmentId, toDepartmentId: group.departmentId, reason: isClaim ? 'Group claimed by a team member' : 'Group claim released' },
    })
    return updatedGroup
  })

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { id: ownerId },
        ...(fromDepartmentId ? [{ routingDepartmentId: fromDepartmentId }] : []),
        ...(department ? [{ routingDepartmentId: department.id }] : []),
      ],
    },
    select: { id: true },
  })
  void publishEvent('chat_events', {
    type: 'conversation_update',
    userId: String(ownerId),
    userIds: recipients.map((user) => String(user.id)),
    conversationId: updated.id,
    payload: { group: updated },
  })
  return NextResponse.json({ data: updated })
}
