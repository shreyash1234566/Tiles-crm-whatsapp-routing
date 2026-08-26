import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { isClosedInquiryStage, isValidEvolutionStageTransition } from '@/lib/evolution-operations'

function displayId(): string {
  return `DO-EVO-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`
}

function validDate(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) ? date : null
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only an admin or manager can convert a group inquiry into a dealer order' }, { status: 403 })
  }
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as { expectedDispatchDate?: string; notes?: string }
  const expectedDispatchDate = validDate(body.expectedDispatchDate)
  if (body.expectedDispatchDate && !expectedDispatchDate) return NextResponse.json({ error: 'expectedDispatchDate must be valid' }, { status: 400 })

  const group = await prisma.evolutionGroup.findFirst({
    where: { id, userId: ownerId },
    include: { inquiry: true, ticket: true },
  })
  if (!group?.inquiry || !group.ticket) return NextResponse.json({ error: 'An Evolution inquiry and ticket are required before conversion' }, { status: 409 })
  if (!group.inquiry.dealerId) return NextResponse.json({ error: 'Link this WhatsApp group to a dealer before creating a dealer order' }, { status: 409 })
  if (group.inquiry.convertedOrderId) return NextResponse.json({ error: 'This inquiry is already linked to a dealer order', dealerOrderId: group.inquiry.convertedOrderId }, { status: 409 })
  if (isClosedInquiryStage(group.inquiry.stage)) return NextResponse.json({ error: 'A closed inquiry cannot be converted into a dealer order' }, { status: 409 })

  if (group.inquiry.stage !== 'CONFIRMED' && !isValidEvolutionStageTransition(group.inquiry.stage, 'CONFIRMED')) {
    return NextResponse.json({ error: `Move the inquiry to CONFIRMED from ${group.inquiry.stage} before creating a dealer order` }, { status: 409 })
  }
  const now = new Date()
  const actorUserId = Number(session.user.id)
  const targetStage = 'CONFIRMED'
  const data = await prisma.$transaction(async (tx) => {
    const dealer = await tx.dealer.findUnique({ where: { id: group.inquiry!.dealerId! }, select: { creditDays: true, assignedStaffId: true } })
    if (!dealer) throw new Error('Linked dealer no longer exists')
    const order = await tx.dealerOrder.create({
      data: {
        displayId: displayId(),
        dealerId: group.inquiry!.dealerId!,
        status: 'ORDER_RECEIVED',
        expectedDispatchDate,
        paymentDueDate: dealer.creditDays > 0 ? new Date(now.getTime() + dealer.creditDays * 86_400_000) : null,
        salespersonId: dealer.assignedStaffId || null,
        notes: [
          `Created from Evolution group: ${group.subject}`,
          body.notes?.trim() || null,
        ].filter(Boolean).join('\n'),
      },
    })
    const inquiry = await tx.evolutionDealerInquiry.update({
      where: { id: group.inquiry!.id },
      data: { convertedOrderId: order.id, stage: targetStage as never, lastActivityAt: now },
    })
    const ticket = await tx.evolutionGroupTicket.update({
      where: { id: group.ticket!.id },
      data: { stage: targetStage as never, version: { increment: 1 } },
    })
    await tx.evolutionRoutingAudit.create({
      data: {
        ticketId: ticket.id,
        inquiryId: inquiry.id,
        actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
        event: 'DEALER_ORDER_CREATED',
        routeType: 'MANUAL',
        reason: `Created dealer order ${order.displayId} from Evolution inquiry`,
        metadata: { dealerOrderId: order.id, expectedDispatchDate: expectedDispatchDate?.toISOString() || null },
      },
    })
    return { order, inquiry, ticket }
  }).catch((error) => ({ error: error instanceof Error ? error.message : 'Unable to create dealer order' }))
  if ('error' in data) return NextResponse.json({ error: data.error }, { status: 409 })
  return NextResponse.json({ data }, { status: 201 })
}
