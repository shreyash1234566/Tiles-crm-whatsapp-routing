import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { canAccessDepartmentWorkItem, isRoutingManager, workItemRecipientIds } from '@/lib/evolution-work-items'
import { publishEvent } from '@/lib/redis'

type WorkItemAction = 'claim' | 'release' | 'transfer' | 'done' | 'reopen'

async function getScopedWorkItem(id: string, sessionUser: NonNullable<Awaited<ReturnType<typeof getSession>>>['user'], ownerId: number) {
  const item = await prisma.evolutionDepartmentWorkItem.findFirst({
    where: { id, group: { userId: ownerId } },
    include: { group: { select: { id: true, subject: true } }, ticket: { select: { id: true, inquiryId: true } } },
  })
  if (!item || !canAccessDepartmentWorkItem(sessionUser, item)) return null
  return item
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const actorUserId = Number(session.user.id)
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const item = await getScopedWorkItem(id, session.user, ownerId)
  if (!item) return NextResponse.json({ error: 'Work item not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { action?: string; departmentId?: number; reason?: string; expectedVersion?: number }
  const action = String(body.action || '').toLowerCase() as WorkItemAction
  if (!['claim', 'release', 'transfer', 'done', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'action must be claim, release, transfer, done, or reopen' }, { status: 400 })
  }
  const manager = isRoutingManager(session.user)
  if ((action === 'transfer' || action === 'reopen') && !manager) return NextResponse.json({ error: 'Only an admin or manager can perform this action' }, { status: 403 })
  if (item.status === 'DONE' && !['reopen'].includes(action)) return NextResponse.json({ error: 'This work item is already Done. Reopen it before changing it.' }, { status: 409 })
  // Older clients may omit the version, but every write still uses the
  // version read above as its compare-and-swap token. This prevents a stale
  // claim/Done/transfer click from overwriting a newer department action.
  const expectedVersion = body.expectedVersion == null ? item.version : body.expectedVersion
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return NextResponse.json({ error: 'expectedVersion must be a positive integer' }, { status: 400 })
  if (item.version !== expectedVersion) return NextResponse.json({ error: 'This work item changed; refresh before updating it', currentVersion: item.version }, { status: 409 })
  if (action === 'claim' && item.claimedByUserId && item.claimedByUserId !== actorUserId) return NextResponse.json({ error: 'This work item is already claimed by another team member' }, { status: 409 })
  if (action === 'release' && item.claimedByUserId && item.claimedByUserId !== actorUserId && !manager) return NextResponse.json({ error: 'Only the claimant or a manager can release this work item' }, { status: 403 })

  let targetDepartment: { id: number; name: string } | null = null
  if (action === 'transfer') {
    const departmentId = Number(body.departmentId)
    if (!Number.isInteger(departmentId) || departmentId <= 0) return NextResponse.json({ error: 'A target department is required' }, { status: 400 })
    targetDepartment = await prisma.routingDepartment.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } })
    if (!targetDepartment) return NextResponse.json({ error: 'Invalid or inactive department' }, { status: 400 })
    if (targetDepartment.id === item.departmentId) return NextResponse.json({ error: 'Work item is already in this department' }, { status: 400 })
  }

  const now = new Date()
  const reason = String(body.reason || '').trim() || `Work item ${action} by ${session.user.name || 'team member'}`
  let updated
  try {
    updated = await prisma.$transaction(async (tx) => {
      const data = action === 'claim'
        ? { claimedByUserId: actorUserId, claimedAt: now, assignedUserId: actorUserId, version: { increment: 1 } }
        : action === 'release'
          ? { claimedByUserId: null, claimedAt: null, assignedUserId: null, version: { increment: 1 } }
          : action === 'done'
            ? { status: 'DONE', doneAt: now, doneByUserId: actorUserId, unreadCount: 0, version: { increment: 1 } }
            : action === 'reopen'
              ? { status: 'ACTIVE', doneAt: null, doneByUserId: null, version: { increment: 1 } }
              : { departmentId: targetDepartment!.id, departmentName: targetDepartment!.name, assignedUserId: null, claimedByUserId: null, claimedAt: null, version: { increment: 1 } }
      const changed = await tx.evolutionDepartmentWorkItem.updateMany({ where: { id: item.id, version: expectedVersion }, data })
      if (changed.count !== 1) throw new Error('STALE_WORK_ITEM')
      const workItem = await tx.evolutionDepartmentWorkItem.findUniqueOrThrow({ where: { id: item.id } })
    await tx.evolutionDepartmentWorkItemAudit.create({
      data: {
        workItemId: item.id,
        actorUserId,
        event: action.toUpperCase(),
        fromDepartmentId: item.departmentId,
        toDepartmentId: targetDepartment?.id ?? item.departmentId,
        reason,
      },
    })
    await tx.evolutionRoutingAudit.create({
      data: {
        ticketId: item.ticketId,
        inquiryId: item.ticket.inquiryId,
        actorUserId,
        event: `WORK_ITEM_${action.toUpperCase()}`,
        routeType: action === 'transfer' ? 'MANUAL' : item.routeType,
        fromDepartmentId: item.departmentId,
        toDepartmentId: targetDepartment?.id ?? item.departmentId,
        reason,
        metadata: { workItemId: item.id },
      },
    })
      return workItem
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STALE_WORK_ITEM') return NextResponse.json({ error: 'This work item changed; refresh before updating it' }, { status: 409 })
    throw error
  }

  const eligibleUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true, routingDepartmentId: true } })
  const recipientIds = new Set<number>([
    ...workItemRecipientIds(eligibleUsers, item.departmentId, item.assignedUserId),
    ...workItemRecipientIds(eligibleUsers, updated.departmentId, updated.assignedUserId),
  ])
  void publishEvent('chat_events', {
    type: 'conversation_update', userId: String(ownerId), userIds: [...recipientIds].map(String), conversationId: updated.id,
    payload: { workItemId: updated.id, departmentId: updated.departmentId, action, status: updated.status },
  })
  return NextResponse.json({ data: updated })
}
