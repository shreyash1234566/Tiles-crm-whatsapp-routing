import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { isClosedInquiryStage } from '@/lib/evolution-operations'
import { normalizedDepartmentName } from '@/lib/evolution-fulfillment'
import { canAccessDepartmentWorkItem } from '@/lib/evolution-work-items'

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
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isManager = ['ADMIN', 'MANAGER'].includes(session.user.role)
  const isSales = session.user.role === 'STAFF' && normalizedDepartmentName(session.user.routingDepartmentName) === 'sales'
  if (!isManager && !isSales) return NextResponse.json({ error: 'Only Sales, an admin, or a manager can create a dealer order' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  const body = await request.json().catch(() => ({})) as { expectedDispatchDate?: string; notes?: string; expectedVersion?: number }
  const expectedDispatchDate = validDate(body.expectedDispatchDate)
  if (!expectedDispatchDate) return NextResponse.json({ error: 'A valid expected dispatch date is required before creating an order draft' }, { status: 400 })

  const group = await prisma.evolutionGroup.findFirst({
    where: { id, userId: ownerId },
    include: { inquiry: true, ticket: true },
  })
  if (!group?.inquiry || !group.ticket) return NextResponse.json({ error: 'An Evolution inquiry and ticket are required before conversion' }, { status: 409 })
  if (!Number.isInteger(Number(body.expectedVersion)) || Number(body.expectedVersion) !== group.ticket.version) return NextResponse.json({ error: 'This ticket changed; refresh before creating the order draft', currentVersion: group.ticket.version }, { status: 409 })
  if (isSales) {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({
      where: { ticketId: group.ticket.id, departmentId: session.user.routingDepartmentId ?? -1 },
      select: { departmentId: true, assignedUserId: true, claimedByUserId: true },
    })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This ticket is not available to your department' }, { status: 403 })
  }
  if (!group.inquiry.dealerId) return NextResponse.json({ error: 'Link this WhatsApp group to a dealer before creating a dealer order' }, { status: 409 })
  if (group.inquiry.convertedOrderId) return NextResponse.json({ error: 'This inquiry is already linked to a dealer order', dealerOrderId: group.inquiry.convertedOrderId }, { status: 409 })
  if (isClosedInquiryStage(group.inquiry.stage)) return NextResponse.json({ error: 'A closed inquiry cannot be converted into a dealer order' }, { status: 409 })

  if (group.inquiry.stage !== 'CONFIRMED') return NextResponse.json({ error: `Move the inquiry to CONFIRMED from ${group.inquiry.stage} before creating a dealer order` }, { status: 409 })
  const now = new Date()
  const actorUserId = Number(session.user.id)
  const targetStage = 'CONFIRMED'
  const data = await prisma.$transaction(async (tx) => {
    // Lock the inquiry before checking convertedOrderId, so two simultaneous
    // conversion clicks cannot create two order drafts for one inquiry.
    await tx.$queryRaw`SELECT "id" FROM "evolution_dealer_inquiries" WHERE "id" = ${group.inquiry!.id} FOR UPDATE`
    const lockedInquiry = await tx.evolutionDealerInquiry.findUniqueOrThrow({ where: { id: group.inquiry!.id } })
    if (lockedInquiry.convertedOrderId || lockedInquiry.stage !== 'CONFIRMED') throw new Error('This inquiry was already converted or changed; refresh before trying again')
    const lockedTicket = await tx.evolutionGroupTicket.updateMany({
      where: { id: group.ticket!.id, version: Number(body.expectedVersion) },
      data: { version: { increment: 1 } },
    })
    if (lockedTicket.count !== 1) throw new Error('This ticket changed; refresh before trying again')
    const dealer = await tx.dealer.findUnique({ where: { id: group.inquiry!.dealerId! }, select: { creditDays: true, assignedStaffId: true } })
    if (!dealer) throw new Error('Linked dealer no longer exists')
    const order = await tx.dealerOrder.create({
      data: {
        displayId: displayId(),
        dealerId: group.inquiry!.dealerId!,
        // A WhatsApp confirmation is an order draft, not a priced/approved
        // order. Fulfillment actions are blocked until sales adds real items.
        status: 'ENQUIRY',
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
    const ticket = await tx.evolutionGroupTicket.findUniqueOrThrow({ where: { id: group.ticket!.id } })
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
    await tx.evolutionFulfillmentEvent.create({
      data: { ticketId: ticket.id, inquiryId: inquiry.id, dealerOrderId: order.id, actorUserId: Number.isInteger(actorUserId) ? actorUserId : null, action: 'DEALER_ORDER_CREATED', fromStage: group.inquiry!.stage, toStage: targetStage as never, note: body.notes?.trim() || null, metadata: { displayId: order.displayId, expectedDispatchDate: expectedDispatchDate?.toISOString() || null } },
    })
    return { order, inquiry, ticket }
  }).catch((error) => ({ error: error instanceof Error ? error.message : 'Unable to create dealer order' }))
  if ('error' in data) return NextResponse.json({ error: data.error }, { status: 409 })
  return NextResponse.json({ data }, { status: 201 })
}
