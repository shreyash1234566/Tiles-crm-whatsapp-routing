import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getEvolutionFollowUpQueue } from '@/lib/queues/jobs'

async function resolveGroup(id: string) {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerId }, include: { ticket: true, inquiry: true } })
  if (!group || (session.user.role === 'STAFF' && group.departmentId !== session.user.routingDepartmentId)) {
    return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) }
  }
  if (!group.ticket) return { error: NextResponse.json({ error: 'This group has no ticket yet' }, { status: 409 }) }
  return { session, group }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await resolveGroup(id)
  if ('error' in resolved) return resolved.error
  const data = await prisma.evolutionTicketFollowUp.findMany({
    where: { ticketId: resolved.group.ticket!.id },
    orderBy: { scheduledFor: 'asc' },
  })
  return NextResponse.json({ data })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await resolveGroup(id)
  if ('error' in resolved) return resolved.error
  const { session, group } = resolved
  const actorUserId = Number(session.user.id)
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { message?: string; scheduledFor?: string; idempotencyKey?: string }
  const message = String(body.message || '').trim()
  const scheduledFor = new Date(String(body.scheduledFor || ''))
  if (message.length < 2 || message.length > 4_000) return NextResponse.json({ error: 'message must be between 2 and 4000 characters' }, { status: 400 })
  if (!Number.isFinite(scheduledFor.getTime())) return NextResponse.json({ error: 'scheduledFor must be a valid ISO date' }, { status: 400 })
  const now = new Date()
  if (scheduledFor.getTime() < now.getTime() + 60_000) return NextResponse.json({ error: 'A follow-up must be scheduled at least one minute in the future' }, { status: 400 })
  if (scheduledFor.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'A follow-up cannot be scheduled more than 90 days ahead' }, { status: 400 })
  const rawKey = String(body.idempotencyKey || randomUUID()).trim()
  const idempotencyKey = `followup:${rawKey.slice(0, 100)}`
  const duplicate = await prisma.evolutionTicketFollowUp.findUnique({ where: { idempotencyKey } })
  if (duplicate) return NextResponse.json({ data: duplicate, idempotent: true })

  const data = await prisma.$transaction(async (tx) => {
    const followUp = await tx.evolutionTicketFollowUp.create({
      data: {
        ticketId: group.ticket!.id,
        inquiryId: group.inquiry?.id || null,
        assignedUserId: actorUserId,
        departmentId: group.departmentId,
        message,
        scheduledFor,
        idempotencyKey,
      },
    })
    if (group.inquiry) {
      const next = await tx.evolutionTicketFollowUp.findFirst({
        where: { inquiryId: group.inquiry.id, status: 'PENDING' },
        orderBy: { scheduledFor: 'asc' },
        select: { scheduledFor: true },
      })
      await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: { nextFollowUpAt: next?.scheduledFor || scheduledFor, lastActivityAt: now } })
    }
    await tx.evolutionRoutingAudit.create({
      data: { ticketId: group.ticket!.id, messageId: 'follow-up', inquiryId: group.inquiry?.id || null, actorUserId, event: 'FOLLOW_UP_SCHEDULED', routeType: 'MANUAL', reason: `Follow-up scheduled for ${scheduledFor.toISOString()}`, metadata: { followUpId: followUp.id } },
    })
    return followUp
  })
  const delay = Math.max(0, scheduledFor.getTime() - Date.now())
  try {
    await getEvolutionFollowUpQueue().add('send-group-follow-up', { followUpId: data.id }, {
      jobId: `evolution-follow-up:${data.id}`,
      delay,
    })
  } catch (error) {
    // The database record remains pending and visible to the team; do not
    // pretend it was scheduled when Redis is unavailable.
    await prisma.evolutionTicketFollowUp.update({ where: { id: data.id }, data: { error: `Queue unavailable: ${error instanceof Error ? error.message.slice(0, 500) : 'unknown error'}` } })
    return NextResponse.json({ data, warning: 'Follow-up was saved but the dispatch queue is unavailable.' }, { status: 202 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await resolveGroup(id)
  if ('error' in resolved) return resolved.error
  const { session, group } = resolved
  const followUpId = new URL(request.url).searchParams.get('follow_up_id')?.trim()
  if (!followUpId) return NextResponse.json({ error: 'follow_up_id is required' }, { status: 400 })
  const followUp = await prisma.evolutionTicketFollowUp.findFirst({ where: { id: followUpId, ticketId: group.ticket!.id } })
  if (!followUp) return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })
  const actorUserId = Number(session.user.id)
  const isManager = ['ADMIN', 'MANAGER'].includes(session.user.role)
  if (followUp.assignedUserId && followUp.assignedUserId !== actorUserId && !isManager) return NextResponse.json({ error: 'Only the assignee or a manager can cancel this follow-up' }, { status: 403 })
  const data = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.evolutionTicketFollowUp.update({ where: { id: followUp.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    if (group.inquiry) {
      const next = await tx.evolutionTicketFollowUp.findFirst({ where: { inquiryId: group.inquiry.id, status: 'PENDING' }, orderBy: { scheduledFor: 'asc' }, select: { scheduledFor: true } })
      await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: { nextFollowUpAt: next?.scheduledFor || null } })
    }
    await tx.evolutionRoutingAudit.create({ data: { ticketId: group.ticket!.id, messageId: 'follow-up', inquiryId: group.inquiry?.id || null, actorUserId, event: 'FOLLOW_UP_CANCELLED', routeType: 'MANUAL', reason: 'Follow-up cancelled', metadata: { followUpId: followUp.id } } })
    return cancelled
  })
  return NextResponse.json({ data })
}
