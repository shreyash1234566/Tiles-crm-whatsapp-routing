import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'STAFF') return NextResponse.json({ error: 'Agent run history is manager-only' }, { status: 403 })
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerUserId }, select: { id: true, departmentId: true } })
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  const data = await prisma.evolutionAgentRun.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, inboundMessageId: true, status: true, mode: true, responseText: true, confidence: true, handoff: true, retrievalIds: true, error: true, createdAt: true },
  })
  return NextResponse.json({ data })
}
