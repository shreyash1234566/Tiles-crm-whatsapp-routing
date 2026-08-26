import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { normalizeWorkItemFilter } from '@/lib/evolution-work-items'

async function access() {
  const session = await getSession()
  if (!session?.user) return null
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return null
  return { user: session.user, ownerId }
}

// This route is the staff inbox source of truth. It intentionally reads
// department work items, never EvolutionGroup.departmentId, so a group can
// have concurrent Sales/Accounts/Logistics responsibilities without leakage.
export async function GET(request: Request) {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const filter = normalizeWorkItemFilter(params.get('filter'))
  const requestedDepartmentId = Number(params.get('department_id') || '')
  const where: {
    group: { userId: number }
    status?: string | { in: string[] }
    departmentId?: number
  } = { group: { userId: current.ownerId } }

  if (filter === 'active') where.status = 'ACTIVE'
  if (filter === 'done') where.status = 'DONE'

  if (current.user.role === 'STAFF') {
    if (!current.user.routingDepartmentId) return NextResponse.json({ data: [], filter })
    where.departmentId = current.user.routingDepartmentId
  } else if (Number.isInteger(requestedDepartmentId) && requestedDepartmentId > 0) {
    where.departmentId = requestedDepartmentId
  }

  const workItems = await prisma.evolutionDepartmentWorkItem.findMany({
    where,
    orderBy: [
      { status: 'asc' },
      { mentionPriority: 'desc' },
      { unreadCount: 'desc' },
      { lastMessageAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      groupId: true,
      ticketId: true,
      departmentId: true,
      departmentName: true,
      status: true,
      assignedUserId: true,
      claimedByUserId: true,
      claimedAt: true,
      routingReason: true,
      routeType: true,
      intent: true,
      confidence: true,
      mentionPriority: true,
      lastMessageText: true,
      lastMessageAt: true,
      unreadCount: true,
      doneAt: true,
      doneByUserId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      group: { select: { id: true, groupJid: true, subject: true } },
      ticket: {
        select: {
          id: true, stage: true, status: true, inquiry: {
            select: {
              id: true, dealerId: true, convertedOrderId: true, stage: true, priority: true,
              slaDueAt: true, nextFollowUpAt: true, lastActivityAt: true,
              dealer: { select: { id: true, businessName: true, contactPerson: true, phone: true, whatsappNumber: true } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({ data: workItems, filter })
}
