import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerId } })
  if (!group || (session.user.role === 'STAFF' && group.departmentId !== session.user.routingDepartmentId)) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  const body = await request.json().catch(() => ({})) as { action?: string }
  const updated = await prisma.evolutionGroup.update({
    where: { id },
    data: body.action === 'release'
      ? { claimedByUserId: null, claimedAt: null }
      : { claimedByUserId: session.user.id, claimedAt: new Date() },
  })
  return NextResponse.json({ data: updated })
}
