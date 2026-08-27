import { NextResponse } from 'next/server'
import type { EvolutionInquiryStage, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { canAccessDepartmentWorkItem, isRoutingManager } from '@/lib/evolution-work-items'
import { canMoveEvolutionStage, canPerformFulfillmentAction, dispatchCountdown, isUsableReceipt } from '@/lib/evolution-fulfillment'
import { evolutionPhoneCandidates, isValidEvolutionStageTransition, normalizeEvolutionPhone } from '@/lib/evolution-operations'
import { deleteFile, uploadFile } from '@/lib/r2'

type Action = 'transition' | 'payment_verified' | 'allocate' | 'dispatch' | 'deliver' | 'link_invoice'
type ScopedGroup = NonNullable<Awaited<ReturnType<typeof getScopedGroup>>>
const ACTIONS = new Set<Action>(['transition', 'payment_verified', 'allocate', 'dispatch', 'deliver', 'link_invoice'])
const VALID_STAGES: EvolutionInquiryStage[] = ['NEW', 'TRIAGED', 'WORKING', 'QUOTATION', 'WAITING_FOR_DEALER', 'CONFIRMED', 'PAYMENT_PENDING', 'ALLOCATED', 'DISPATCH_PENDING', 'DISPATCHED', 'DELIVERED', 'CLOSED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED']
const TERMINAL_STAGES = new Set<EvolutionInquiryStage>(['CLOSED', 'LOST', 'CANCELLED'])

// Public response projection: never expose cost, margins, or payment receipt URLs.
const fulfillmentOrderSelect = {
  id: true, displayId: true, dealerId: true, status: true, orderDate: true,
  expectedDispatchDate: true, committedDeliveryDate: true, paymentDueDate: true, dispatchDate: true, deliveryDate: true,
  subtotal: true, discount: true, gst: true, freight: true, loading: true, installation: true, total: true,
  amountPaid: true, balanceDue: true, paymentStatus: true, deliveryAddress: true, allocationNotes: true,
  fulfillmentGodownId: true, allocationConfirmedAt: true, paymentVerifiedAt: true, paymentReference: true,
  transporterName: true, transportContact: true, lrNumber: true, logisticReceiptUrl: true, logisticReceiptName: true, dispatchNotes: true,
  items: { select: { id: true, productId: true, name: true, sku: true, quantity: true, unitOfMeasure: true, areaSqft: true, rate: true, amount: true, shadeCode: true, lotNumber: true, notes: true } },
  payments: { select: { id: true, amount: true, method: true, reference: true, paymentDate: true }, orderBy: { paymentDate: 'desc' as const } },
  invoices: { select: { id: true, displayId: true, total: true, amountPaid: true, balanceDue: true, paymentStatus: true, date: true } },
  fulfillmentGodown: { select: { id: true, name: true, type: true } },
  allocations: { where: { releasedAt: null, dispatchedAt: null }, select: { id: true, godownId: true, productId: true, quantity: true, lotNumber: true, shadeCode: true, reservedAt: true } },
} satisfies Prisma.DealerOrderSelect

class WorkflowError extends Error { constructor(message: string, readonly status = 409) { super(message) } }
const text = (value: unknown, max = 1000) => String(value || '').trim().slice(0, max)
const number = (value: unknown): number | null => { if (value === '' || value == null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }
const date = (value: unknown): Date | null => { const parsed = new Date(text(value, 100)); return Number.isFinite(parsed.getTime()) ? parsed : null }
const expectedVersionMatches = (raw: unknown, current: number) => { const expected = number(raw); return Number.isInteger(expected) && expected === current }

async function getScopedGroup(id: string, user: NonNullable<Awaited<ReturnType<typeof getSession>>>['user'], ownerUserId: number) {
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerUserId }, include: {
    ticket: true,
    inquiry: { include: {
      dealer: { select: { id: true, businessName: true, contactPerson: true, phone: true, alternatePhone: true, whatsappNumber: true, city: true, state: true, gstNumber: true, creditDays: true, creditLimit: true, priceTier: true } },
      convertedOrder: { select: fulfillmentOrderSelect },
    } },
  } })
  if (!group?.ticket || !group.inquiry) return null
  if (isRoutingManager(user)) return group as typeof group & { ticket: NonNullable<typeof group.ticket>; inquiry: NonNullable<typeof group.inquiry> }
  const scoped = await prisma.evolutionDepartmentWorkItem.findFirst({ where: { ticketId: group.ticket.id, departmentId: user.routingDepartmentId ?? -1 }, select: { departmentId: true, assignedUserId: true, claimedByUserId: true, status: true } })
  return scoped?.status === 'ACTIVE' && canAccessDepartmentWorkItem(user, scoped) ? group as typeof group & { ticket: NonNullable<typeof group.ticket>; inquiry: NonNullable<typeof group.inquiry> } : null
}

function stageMutation(stage: EvolutionInquiryStage, closed = false) {
  const now = new Date()
  return { inquiry: { stage, lastActivityAt: now, ...(closed ? { closedAt: now } : {}) }, ticket: { stage, status: closed ? 'closed' : 'open', ...(closed ? { closedAt: now } : {}), ...(stage === 'DELIVERED' ? { resolvedAt: now } : {}) }, group: { status: closed ? 'closed' : 'open' } }
}

const STALE_TICKET = 'STALE_TICKET'
async function updateTicketAtExpectedVersion(tx: Prisma.TransactionClient, ticketId: string, expectedVersion: number, data: Prisma.EvolutionGroupTicketUpdateManyMutationInput) {
  const result = await tx.evolutionGroupTicket.updateMany({ where: { id: ticketId, version: expectedVersion }, data: { ...data, version: { increment: 1 } } })
  if (result.count !== 1) throw new Error(STALE_TICKET)
  return tx.evolutionGroupTicket.findUniqueOrThrow({ where: { id: ticketId } })
}
async function runMutation<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return { data: await prisma.$transaction(operation) } as const } catch (error) {
    if (error instanceof Error && error.message === STALE_TICKET) return { error: 'This ticket changed; refresh before trying again', status: 409 } as const
    if (error instanceof WorkflowError) return { error: error.message, status: error.status } as const
    throw error
  }
}

async function releaseReservations(tx: Prisma.TransactionClient, dealerOrderId: number, actorUserId: number) {
  const allocations = await tx.dealerOrderAllocation.findMany({ where: { dealerOrderId, releasedAt: null, dispatchedAt: null } })
  for (const allocation of allocations) {
    const [stock] = await tx.$queryRaw<Array<{ id: number; reservedQuantity: number }>>`SELECT "id", "reservedQuantity" FROM "GodownStock" WHERE "godownId" = ${allocation.godownId} AND "productId" = ${allocation.productId} FOR UPDATE`
    if (!stock) throw new WorkflowError('Reserved stock record is missing; ask a manager to reconcile this allocation')
    await tx.godownStock.update({ where: { id: stock.id }, data: { reservedQuantity: Math.max(0, stock.reservedQuantity - allocation.quantity) } })
    await tx.dealerOrderAllocation.update({ where: { id: allocation.id }, data: { releasedAt: new Date(), releasedByUserId: actorUserId } })
  }
  return allocations.length
}
async function consumeReservations(tx: Prisma.TransactionClient, dealerOrderId: number) {
  const allocations = await tx.dealerOrderAllocation.findMany({ where: { dealerOrderId, releasedAt: null, dispatchedAt: null } })
  if (!allocations.length) throw new WorkflowError('This order has no active warehouse reservation to dispatch')
  for (const allocation of allocations) {
    const [stock] = await tx.$queryRaw<Array<{ id: number; quantity: number; reservedQuantity: number }>>`SELECT "id", "quantity", "reservedQuantity" FROM "GodownStock" WHERE "godownId" = ${allocation.godownId} AND "productId" = ${allocation.productId} FOR UPDATE`
    if (!stock || stock.quantity < allocation.quantity || stock.reservedQuantity < allocation.quantity) throw new WorkflowError('Reserved stock is no longer available; reconcile the allocation before dispatch')
    await tx.godownStock.update({ where: { id: stock.id }, data: { quantity: { decrement: allocation.quantity }, reservedQuantity: { decrement: allocation.quantity } } })
    await tx.dealerOrderAllocation.update({ where: { id: allocation.id }, data: { dispatchedAt: new Date() } })
  }
}
function ensurePricedOrder(order: ScopedGroup['inquiry']['convertedOrder']) {
  if (!order || order.items.length === 0 || order.total <= 0 || order.items.some((item) => !item.productId || item.quantity <= 0 || item.amount < 0)) throw new WorkflowError('Add priced product line items to the dealer-order draft before payment, allocation, or dispatch')
}
async function transitionInTransaction(tx: Prisma.TransactionClient, group: ScopedGroup, actorUserId: number, to: EvolutionInquiryStage, action: string, note: string, metadata: Prisma.InputJsonValue = {}) {
  const from = group.inquiry.stage; const update = stageMutation(to, TERMINAL_STAGES.has(to))
  const inquiry = await tx.evolutionDealerInquiry.update({ where: { id: group.inquiry.id }, data: update.inquiry })
  const ticket = await updateTicketAtExpectedVersion(tx, group.ticket.id, group.ticket.version, update.ticket)
  await tx.evolutionGroup.update({ where: { id: group.id }, data: update.group })
  await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, inquiryId: inquiry.id, actorUserId, event: 'STAGE_CHANGED', routeType: 'MANUAL', reason: note, metadata: { from, to, action } } })
  await tx.evolutionFulfillmentEvent.create({ data: { ticketId: ticket.id, inquiryId: inquiry.id, dealerOrderId: inquiry.convertedOrderId, actorUserId, action, fromStage: from, toStage: to, note: note || null, metadata } })
  return { inquiry, ticket }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerUserId = await getEvolutionOwnerUserId(); if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params; const group = await getScopedGroup(id, session.user, ownerUserId)
  if (!group) return NextResponse.json({ error: 'Ticket not found or not available to your active department work' }, { status: 404 })
  const events = await prisma.evolutionFulfillmentEvent.findMany({ where: { ticketId: group.ticket.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, fromStage: true, toStage: true, note: true, createdAt: true } })
  const order = group.inquiry.convertedOrder
  return NextResponse.json({ data: { group: { id: group.id, subject: group.subject }, ticket: { id: group.ticket.id, stage: group.ticket.stage, version: group.ticket.version }, inquiry: { id: group.inquiry.id, stage: group.inquiry.stage, dealerId: group.inquiry.dealerId, convertedOrderId: group.inquiry.convertedOrderId, dealer: group.inquiry.dealer }, order: order ? { ...order, countdown: dispatchCountdown(order.expectedDispatchDate) } : null, events } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const actorUserId = Number(session.user.id); if (!Number.isInteger(actorUserId) || actorUserId <= 0) return NextResponse.json({ error: 'Invalid user session' }, { status: 401 })
  const ownerUserId = await getEvolutionOwnerUserId(); if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params; const multipart = request.headers.get('content-type')?.includes('multipart/form-data'); const form = multipart ? await request.formData() : null
  const body: Record<string, unknown> = form ? Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')) : await request.json().catch(() => ({})) as Record<string, unknown>
  const receipt = form?.get('receipt'); const action = text(body.action, 50).toLowerCase() as Action
  if (!ACTIONS.has(action)) return NextResponse.json({ error: 'Unsupported fulfillment action' }, { status: 400 })
  const group = await getScopedGroup(id, session.user, ownerUserId)
  if (!group) return NextResponse.json({ error: 'Ticket not found or not available to your active department work' }, { status: 404 })
  if (!expectedVersionMatches(body.expectedVersion, group.ticket.version)) return NextResponse.json({ error: 'This ticket changed; refresh before updating it', currentVersion: group.ticket.version }, { status: 409 })
  const reason = text(body.reason, 1000); const order = group.inquiry.convertedOrder

  if (action === 'transition') {
    const stage = text(body.stage, 50).toUpperCase() as EvolutionInquiryStage
    if (!VALID_STAGES.includes(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    if (!canMoveEvolutionStage(session.user, stage)) return NextResponse.json({ error: 'Your department cannot move a ticket to this stage' }, { status: 403 })
    if (!reason) return NextResponse.json({ error: 'A transition reason is required' }, { status: 400 })
    if (!isValidEvolutionStageTransition(group.inquiry.stage, stage)) return NextResponse.json({ error: `Cannot move from ${group.inquiry.stage} to ${stage}` }, { status: 409 })
    if (stage === 'CONFIRMED' && !group.inquiry.dealerId) return NextResponse.json({ error: 'Link a dealer before confirming this inquiry' }, { status: 409 })
    const result = await runMutation(async (tx) => { const released = stage === 'CANCELLED' && order ? await releaseReservations(tx, order.id, actorUserId) : 0; if (stage === 'CANCELLED' && order) await tx.dealerOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED' } }); return transitionInTransaction(tx, group, actorUserId, stage, 'STAGE_CHANGED', reason, released ? { releasedReservationCount: released } : {}) })
    return 'error' in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result)
  }
  if (!order) return NextResponse.json({ error: 'Create a dealer-order draft from this confirmed inquiry before fulfillment actions' }, { status: 409 })
  if (!canPerformFulfillmentAction(session.user, action)) return NextResponse.json({ error: 'Your department cannot perform this fulfillment action' }, { status: 403 })
  try { ensurePricedOrder(order) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Order is not ready' }, { status: 409 }) }

  if (action === 'payment_verified') {
    if (!['CONFIRMED', 'PAYMENT_PENDING'].includes(group.inquiry.stage)) return NextResponse.json({ error: 'Payment can be verified only after confirmation and before allocation' }, { status: 409 })
    const amount = number(body.amount); const reference = text(body.reference, 250)
    if (amount != null && (amount <= 0 || amount > order.balanceDue)) return NextResponse.json({ error: 'Payment amount must be positive and cannot exceed the outstanding balance' }, { status: 400 })
    if ((amount == null || amount === 0) && order.amountPaid <= 0) return NextResponse.json({ error: 'Record a positive received amount before verifying payment' }, { status: 400 })
    if (!reference) return NextResponse.json({ error: 'Payment reference is required for verification' }, { status: 400 })
    const result = await runMutation(async (tx) => {
      const verifiedAmountPaid = order.amountPaid + (amount || 0)
      if (amount && amount > 0) { await tx.dealerPayment.create({ data: { dealerId: order.dealerId, dealerOrderId: order.id, amount, method: text(body.method, 100) || 'UPI', reference, notes: reason || 'Verified from Evolution ticket' } }); await tx.dealerOrder.update({ where: { id: order.id }, data: { amountPaid: { increment: amount }, balanceDue: { decrement: amount } } }) }
      const updatedOrder = await tx.dealerOrder.update({ where: { id: order.id }, data: { paymentVerifiedAt: new Date(), paymentVerifiedByUserId: actorUserId, paymentReference: reference, paymentStatus: verifiedAmountPaid >= order.total ? 'PAID' : 'PARTIAL' } })
      const transitioned = group.inquiry.stage === 'PAYMENT_PENDING' ? { inquiry: group.inquiry, ticket: await updateTicketAtExpectedVersion(tx, group.ticket.id, group.ticket.version, {}) } : await transitionInTransaction(tx, group, actorUserId, 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', reason || `Payment verified: ${reference}`, { amount: amount || 0, reference })
      if (group.inquiry.stage === 'PAYMENT_PENDING') await tx.evolutionFulfillmentEvent.create({ data: { ticketId: transitioned.ticket.id, inquiryId: group.inquiry.id, dealerOrderId: order.id, actorUserId, action: 'PAYMENT_VERIFIED', fromStage: group.inquiry.stage, toStage: group.inquiry.stage, note: reason || null, metadata: { amount: amount || 0, reference } } })
      return { order: updatedOrder, ...transitioned }
    })
    return 'error' in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result)
  }

  if (action === 'allocate') {
    if (group.inquiry.stage !== 'PAYMENT_PENDING') return NextResponse.json({ error: 'Verify payment or approved credit terms before allocation' }, { status: 409 })
    const godownId = number(body.godownId); const allocationNotes = text(body.allocationNotes, 2000)
    if (!Number.isInteger(godownId) || !allocationNotes) return NextResponse.json({ error: 'Godown and allocated lot/slab/box details are required' }, { status: 400 })
    const godown = await prisma.godown.findUnique({ where: { id: godownId! }, select: { id: true, name: true } }); if (!godown) return NextResponse.json({ error: 'Selected godown was not found' }, { status: 404 })
    const result = await runMutation(async (tx) => {
      // Serialize allocations per order as well as per stock row. This blocks a
      // second Warehouse click from reserving the same order twice.
      await tx.$queryRaw`SELECT "id" FROM "DealerOrder" WHERE "id" = ${order.id} FOR UPDATE`
      if (await tx.dealerOrderAllocation.count({ where: { dealerOrderId: order.id, releasedAt: null, dispatchedAt: null } })) throw new WorkflowError('This order already has an active warehouse allocation')
      const creditDays = group.inquiry.dealer?.creditDays || 0; const creditLimit = group.inquiry.dealer?.creditLimit || 0
      if (!order.paymentVerifiedAt && (creditDays <= 0 || (creditLimit > 0 && order.balanceDue > creditLimit))) throw new WorkflowError('Payment is not verified and the dealer does not have sufficient approved credit terms')
      for (const item of order.items) {
        if (!item.productId) throw new WorkflowError(`Line item ${item.name} is not linked to an inventory product`)
        const [stock] = await tx.$queryRaw<Array<{ id: number; quantity: number; reservedQuantity: number }>>`SELECT "id", "quantity", "reservedQuantity" FROM "GodownStock" WHERE "godownId" = ${godown.id} AND "productId" = ${item.productId} FOR UPDATE`
        if (!stock || stock.quantity - stock.reservedQuantity < item.quantity) throw new WorkflowError(`Insufficient unreserved stock for ${item.name} in ${godown.name}`)
        await tx.godownStock.update({ where: { id: stock.id }, data: { reservedQuantity: { increment: item.quantity } } })
        await tx.dealerOrderAllocation.create({ data: { dealerOrderId: order.id, godownId: godown.id, productId: item.productId, quantity: item.quantity, lotNumber: item.lotNumber, shadeCode: item.shadeCode, notes: allocationNotes } })
      }
      const updatedOrder = await tx.dealerOrder.update({ where: { id: order.id }, data: { status: 'ALLOCATED', fulfillmentGodownId: godown.id, allocationNotes, allocationConfirmedAt: new Date() } })
      const transitioned = await transitionInTransaction(tx, group, actorUserId, 'ALLOCATED', 'ALLOCATED', reason || `Allocated at ${godown.name}`, { godownId: godown.id, godownName: godown.name })
      return { order: updatedOrder, ...transitioned }
    })
    return 'error' in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result)
  }

  if (action === 'dispatch') {
    if (group.inquiry.stage !== 'DISPATCH_PENDING') return NextResponse.json({ error: 'Move the allocated inquiry to Dispatch Pending before dispatching' }, { status: 409 })
    const transporterName = text(body.transporterName, 250); const transportContact = text(body.transportContact, 100); const lrNumber = text(body.lrNumber, 150)
    if (!transporterName || !lrNumber) return NextResponse.json({ error: 'Transporter name and LR/Bilty number are required' }, { status: 400 })
    if (!(receipt instanceof File) || !isUsableReceipt(receipt)) return NextResponse.json({ error: 'Attach a non-empty Bilty/LR image or PDF under 25 MB before marking dispatch' }, { status: 400 })
    const logisticReceiptUrl = await uploadFile(Buffer.from(await receipt.arrayBuffer()), receipt.name, receipt.type || 'application/octet-stream', `evolution/fulfillment/${ownerUserId}`)
    const expectedDeliveryDate = date(body.expectedDeliveryDate); const dispatchNotes = text(body.dispatchNotes, 2000)
    try {
      const result = await runMutation(async (tx) => { await consumeReservations(tx, order.id); const updatedOrder = await tx.dealerOrder.update({ where: { id: order.id }, data: { status: 'DISPATCHED', dispatchDate: new Date(), transporterName, transportContact: transportContact || null, lrNumber, logisticReceiptUrl, logisticReceiptName: receipt.name, dispatchNotes: dispatchNotes || null, committedDeliveryDate: expectedDeliveryDate } }); const transitioned = await transitionInTransaction(tx, group, actorUserId, 'DISPATCHED', 'DISPATCHED', reason || `Dispatched via ${transporterName}; LR ${lrNumber}`, { transporterName, transportContact, lrNumber, expectedDeliveryDate: expectedDeliveryDate?.toISOString() || null }); return { order: updatedOrder, ...transitioned } })
      if ('error' in result) { await deleteFile(logisticReceiptUrl); return NextResponse.json({ error: result.error }, { status: result.status }) }
      return NextResponse.json(result)
    } catch (error) { await deleteFile(logisticReceiptUrl); throw error }
  }

  if (action === 'deliver') {
    if (group.inquiry.stage !== 'DISPATCHED') return NextResponse.json({ error: 'Only a dispatched inquiry can be marked delivered' }, { status: 409 })
    const result = await runMutation(async (tx) => { const updatedOrder = await tx.dealerOrder.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveryDate: new Date() } }); const transitioned = await transitionInTransaction(tx, group, actorUserId, 'DELIVERED', 'DELIVERED', reason || 'Delivery confirmed'); return { order: updatedOrder, ...transitioned } })
    return 'error' in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result)
  }

  const invoiceId = number(body.invoiceId); if (!Number.isInteger(invoiceId) || invoiceId! <= 0) return NextResponse.json({ error: 'A valid invoice is required' }, { status: 400 })
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId! }, select: { id: true, dealerOrderId: true, displayId: true, contact: { select: { phone: true } } } }); if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.dealerOrderId && invoice.dealerOrderId !== order.id) return NextResponse.json({ error: 'This invoice is already linked to a different dealer order' }, { status: 409 })
  const dealerPhones = [group.inquiry.dealer?.phone, group.inquiry.dealer?.alternatePhone, group.inquiry.dealer?.whatsappNumber].flatMap(evolutionPhoneCandidates)
  const sameDealer = dealerPhones.includes(normalizeEvolutionPhone(invoice.contact.phone)); const overrideReason = text(body.overrideReason, 500); const override = isRoutingManager(session.user) && body.overrideDealerMatch === true && overrideReason
  if (!sameDealer && !override) return NextResponse.json({ error: 'Invoice contact does not match this dealer. A manager may link it only with an override reason.' }, { status: 409 })
  const result = await runMutation(async (tx) => { const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { dealerOrderId: order.id } }); const ticket = await updateTicketAtExpectedVersion(tx, group.ticket.id, group.ticket.version, {}); await tx.evolutionFulfillmentEvent.create({ data: { ticketId: ticket.id, inquiryId: group.inquiry.id, dealerOrderId: order.id, invoiceId: invoice.id, actorUserId, action: 'INVOICE_LINKED', fromStage: group.inquiry.stage, toStage: group.inquiry.stage, note: reason || `Linked invoice ${invoice.displayId}`, metadata: override ? { overrideDealerMatch: true, overrideReason } : {} } }); return updatedInvoice })
  return 'error' in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result)
}
