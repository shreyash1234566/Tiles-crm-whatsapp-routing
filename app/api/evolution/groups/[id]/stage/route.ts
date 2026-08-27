import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { isClosedInquiryStage, isEvolutionInquiryStage, isValidEvolutionStageTransition } from '@/lib/evolution-operations'
import { canMoveEvolutionStage } from '@/lib/evolution-fulfillment'
import { canAccessDepartmentWorkItem } from '@/lib/evolution-work-items'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const actorUserId = Number(session.user.id)
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerUserId }, include: { ticket: true, inquiry: true } })
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (!group.ticket || !group.inquiry) return NextResponse.json({ error: 'An inquiry and ticket are required before changing lifecycle stage' }, { status: 409 })
  if (session.user.role === 'STAFF') {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({
      where: { ticketId: group.ticket.id, departmentId: session.user.routingDepartmentId ?? -1 },
      select: { departmentId: true, assignedUserId: true, claimedByUserId: true },
    })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This ticket is not available to your department' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({})) as { stage?: string; reason?: string; expectedVersion?: number; lostReason?: string }
  const stage = String(body.stage || '').trim().toUpperCase()
  const reason = String(body.reason || '').trim()
  if (!isEvolutionInquiryStage(stage)) return NextResponse.json({ error: 'Invalid inquiry stage' }, { status: 400 })
  if (!canMoveEvolutionStage(session.user, stage as never)) return NextResponse.json({ error: 'Your department cannot move a ticket to this stage' }, { status: 403 })
  if (stage === group.inquiry.stage) return NextResponse.json({ error: 'Inquiry is already at this stage' }, { status: 400 })
  if (!isValidEvolutionStageTransition(group.inquiry.stage, stage)) return NextResponse.json({ error: `Cannot move from ${group.inquiry.stage} to ${stage}` }, { status: 409 })
  if (stage === 'CONFIRMED' && !group.inquiry.dealerId) return NextResponse.json({ error: 'Link a dealer before confirming this inquiry' }, { status: 409 })
  if (!reason || reason.length > 1000) return NextResponse.json({ error: 'A transition reason of up to 1000 characters is required' }, { status: 400 })
  if (body.expectedVersion != null && body.expectedVersion !== group.ticket.version) return NextResponse.json({ error: 'This group changed; refresh before updating it', currentVersion: group.ticket.version }, { status: 409 })
  const now = new Date()
  const closed = isClosedInquiryStage(stage)
  const result = await prisma.$transaction(async (tx) => {
    const inquiry = await tx.evolutionDealerInquiry.update({
      where: { id: group.inquiry!.id },
      data: { stage: stage as never, closedAt: closed ? now : null, lostReason: stage === 'LOST' ? String(body.lostReason || reason).slice(0, 1000) : null, lastActivityAt: now },
    })
    const ticket = await tx.evolutionGroupTicket.update({
      where: { id: group.ticket!.id },
      data: { stage: stage as never, status: closed ? 'closed' : 'open', resolvedAt: ['DELIVERED', 'CLOSED'].includes(stage) ? now : null, closedAt: closed ? now : null, version: { increment: 1 } },
    })
    const updatedGroup = await tx.evolutionGroup.update({ where: { id: group.id }, data: { status: closed ? 'closed' : 'open' } })
    await tx.evolutionRoutingAudit.create({
      data: { ticketId: ticket.id, messageId: 'stage', inquiryId: inquiry.id, actorUserId: Number.isInteger(actorUserId) ? actorUserId : null, event: 'STAGE_CHANGED', routeType: 'MANUAL', reason, metadata: { from: group.inquiry!.stage, to: stage } },
    })
    return { inquiry, ticket, group: updatedGroup }
  })
  return NextResponse.json({ data: result })
}
