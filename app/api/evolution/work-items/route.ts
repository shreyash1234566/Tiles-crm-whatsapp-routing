import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user } = session

  const where: any = { status: { notIn: ['resolved', 'closed', 'done'] } }

  if (user.role === 'STAFF') {
    if (!user.routingDepartmentId) {
      return NextResponse.json({ data: [] })
    }
    where.departmentId = user.routingDepartmentId
  }

  const workItems = await prisma.departmentWorkItem.findMany({
    where,
    include: {
      ticket: {
        include: {
          group: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc' // Order by creation/last updated
    }
  })

  const mapped = workItems.map(wi => {
    const group = wi.ticket.group;
    return {
      workItemId: wi.id,
      id: group.id, // Group ID for message fetching and connection
      groupJid: group.groupJid,
      subject: group.subject,
      departmentId: wi.departmentId,
      departmentName: wi.departmentName,
      status: wi.status,
      assignedUserId: wi.assignedUserId,
      routeType: wi.routeType,
      routingReason: wi.routingReason,
      confidence: wi.confidence,
      mentionPriority: wi.mentionPriority,
      lastMessageText: group.lastMessageText,
      lastMessageAt: group.lastMessageAt,
      unreadCount: group.unreadCount,
      createdAt: wi.createdAt,
      sourceMessageId: wi.sourceMessageId
    }
  })

  // Also sort by last message date since it might be more useful
  mapped.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

  return NextResponse.json({ data: mapped })
}
