import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, isGroupJid } from '@/lib/evolution-routing'

async function access() {
  const session = await getSession()
  if (!session?.user) return null
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return null
  return { user: session.user, ownerId }
}

export async function GET() {
  const current = await access()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, ownerId } = current
  const where: { userId: number; status: string; departmentId?: number | null } = { userId: ownerId, status: 'open' }
  if (user.role === 'STAFF') {
    if (!user.routingDepartmentId) return NextResponse.json({ data: [] })
    where.departmentId = user.routingDepartmentId
  }
  const groups = await prisma.evolutionGroup.findMany({
    where,
    orderBy: [{ mentionPriority: 'desc' }, { unreadCount: 'desc' }, { lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, groupJid: true, subject: true, departmentId: true, departmentName: true,
      routingReason: true, routeType: true, intent: true, confidence: true, assignedUserId: true, mentionPriority: true, lastMentionAt: true, lastMessageText: true,
      lastMessageAt: true, unreadCount: true, claimedByUserId: true, claimedAt: true, status: true, ticket: { select: { id: true, status: true, routeType: true, lastIntent: true, confidence: true, assignedUserId: true } },
    },
  })
  return NextResponse.json({ data: groups })
}

export async function POST(request: Request) {
  const current = await access()
  if (!current || !['ADMIN', 'MANAGER'].includes(current.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({})) as { groupJid?: string; subject?: string; departmentId?: number | null }
  const groupJid = String(body.groupJid || '').trim().toLowerCase()
  if (!isGroupJid(groupJid)) return NextResponse.json({ error: 'A WhatsApp group JID is required' }, { status: 400 })
  const department = body.departmentId ? await prisma.routingDepartment.findFirst({ where: { id: body.departmentId, isActive: true }, select: { id: true, name: true } }) : null
  const group = await prisma.evolutionGroup.upsert({
    where: { userId_groupJid: { userId: current.ownerId, groupJid } },
    update: { subject: body.subject?.trim() || undefined, departmentId: department?.id ?? null, departmentName: department?.name ?? null, routingReason: department ? 'admin-group-mapping' : null, routeType: 'MANUAL' },
    create: { userId: current.ownerId, groupJid, subject: body.subject?.trim() || groupJid, departmentId: department?.id ?? null, departmentName: department?.name ?? null, routingReason: department ? 'admin-group-mapping' : null, routeType: 'MANUAL' },
  })
  return NextResponse.json({ data: group })
}
