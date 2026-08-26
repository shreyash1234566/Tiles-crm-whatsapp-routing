import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const claimantId = Number(session.user.id)

  const body = await request.json().catch(() => ({})) as { action?: string }

  const workItem = await prisma.departmentWorkItem.findUnique({
    where: { id },
    include: {
      ticket: {
        include: { group: true }
      }
    }
  });

  if (!workItem) {
    return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
  }

  // Ensure staff can only modify their department's items
  if (session.user.role === 'STAFF' && workItem.departmentId !== session.user.routingDepartmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (body.action === 'done') {
    const updated = await prisma.departmentWorkItem.update({
      where: { id },
      data: {
        status: 'resolved',
        doneAt: new Date(),
        doneByUserId: claimantId
      }
    })

    return NextResponse.json({ data: updated })
  }

  if (body.action === 'claim' || body.action === 'release') {
      const updated = await prisma.departmentWorkItem.update({
          where: { id },
          data: body.action === 'release'
           ? { assignedUserId: null }
           : { assignedUserId: claimantId }
      })

      return NextResponse.json({ data: updated })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
