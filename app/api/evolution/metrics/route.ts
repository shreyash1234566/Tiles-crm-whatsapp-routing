import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { isClosedInquiryStage } from '@/lib/evolution-operations'
import { dispatchCountdown } from '@/lib/evolution-fulfillment'
import { firstResponseMinutes as measuredFirstResponseMinutes, isConvertedEvolutionInquiry, median } from '@/lib/evolution-metrics'

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1))
  return Math.round(sorted[index])
}

function parseDate(value: string | null, fallback: Date): Date | null {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })

  const query = new URL(request.url).searchParams
  const until = parseDate(query.get('to'), new Date())
  const from = parseDate(query.get('from'), new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  if (!from || !until || from > until) return NextResponse.json({ error: 'from and to must be valid dates with from before to' }, { status: 400 })
  if (until.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Date range cannot exceed 366 days' }, { status: 400 })
  const overdueCutoff = new Date(Math.min(until.getTime(), Date.now()))

  const departmentId = session.user.role === 'STAFF' ? session.user.routingDepartmentId : (query.get('department_id') ? Number(query.get('department_id')) : null)
  // A staff account without a department has no permitted Evolution work
  // scope. Do not accidentally turn a missing department into an all-company
  // metrics query.
  if (session.user.role === 'STAFF' && !departmentId) return NextResponse.json({ error: 'Your staff account is not assigned to a routing department' }, { status: 403 })
  if (departmentId != null && (!Number.isInteger(departmentId) || departmentId <= 0)) return NextResponse.json({ error: 'department_id must be a positive integer' }, { status: 400 })
  const inquiryWhere = {
    ownerUserId,
    // Department ownership lives on work items. The inquiry.departmentId
    // field is only the original/default route and becomes stale after a
    // handoff or when one group has concurrent department responsibilities.
    ...(departmentId ? { ticket: { is: { workItems: { some: { departmentId } } } } } : {}),
    openedAt: { gte: from, lte: until },
  }

  const [inquiries, overdueFollowUps, campaignRecipients, routingAudits, agentRuns, fulfillmentOrders] = await Promise.all([
    prisma.evolutionDealerInquiry.findMany({
      where: inquiryWhere,
      select: {
        id: true, groupId: true, stage: true, departmentId: true, dealerId: true, openedAt: true, slaDueAt: true, nextFollowUpAt: true, closedAt: true, convertedOrderId: true,
        ticket: { select: { resolvedAt: true, closedAt: true, workItems: { select: { departmentId: true, assignedUserId: true, claimedByUserId: true, status: true } } } },
      },
      take: 10_000,
    }),
    prisma.evolutionTicketFollowUp.count({
      where: {
        status: 'PENDING',
        // Keep the card tied to the selected reporting window. A follow-up
        // scheduled years before `from` must not inflate a recent dashboard.
        scheduledFor: { gte: from, lt: overdueCutoff },
        ticket: { group: { userId: ownerUserId }, ...(departmentId ? { workItems: { some: { departmentId } } } : {}) },
      },
    }),
    session.user.role === 'STAFF'
      ? Promise.resolve([] as Array<{ status: string; sentAt: Date | null; deliveredAt: Date | null; readAt: Date | null; repliedAt: Date | null }>)
      : prisma.evolutionCampaignRecipient.findMany({
        where: { campaign: { userId: ownerUserId }, createdAt: { gte: from, lte: until } },
        select: { status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true },
        take: 10_000,
      }),
    prisma.evolutionRoutingAudit.findMany({
      where: { ticket: { group: { userId: ownerUserId } }, ...(departmentId ? { toDepartmentId: departmentId } : {}), createdAt: { gte: from, lte: until } },
      select: { routeType: true, confidence: true, event: true },
      take: 10_000,
    }),
    session.user.role === 'STAFF'
      ? Promise.resolve([] as Array<{ status: string; confidence: number | null; handoff: boolean }>)
      : prisma.evolutionAgentRun.findMany({
        where: { ticket: { is: { group: { is: { userId: ownerUserId } } } }, createdAt: { gte: from, lte: until } },
        select: { status: true, confidence: true, handoff: true },
        take: 10_000,
      }),
    prisma.dealerOrder.findMany({
      // Keep fulfillment totals in the same reporting window as inquiry and
      // campaign metrics. Without this, an old delivered order inflated every
      // current dashboard range.
      where: { orderDate: { gte: from, lte: until }, evolutionInquiries: { some: { ownerUserId, ...(departmentId ? { ticket: { is: { workItems: { some: { departmentId } } } } } : {}) } } },
      select: { status: true, paymentStatus: true, expectedDispatchDate: true, dispatchDate: true, deliveryDate: true, logisticReceiptUrl: true, dealer: { select: { creditDays: true } } },
      take: 10_000,
    }),
  ])

  const responseMessages = inquiries.length > 0 ? await prisma.evolutionGroupMessage.findMany({
    where: {
      groupId: { in: inquiries.map((inquiry) => inquiry.groupId) },
      createdAt: { gte: from, lte: until },
      ...(departmentId ? { workItemMessages: { some: { workItem: { departmentId } } } } : {}),
    },
    select: { groupId: true, fromMe: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 100_000,
  }) : []
  const messagesByGroup = new Map<string, Array<{ fromMe: boolean; createdAt: Date }>>()
  for (const message of responseMessages) {
    const messages = messagesByGroup.get(message.groupId) || []
    messages.push(message)
    messagesByGroup.set(message.groupId, messages)
  }

  const now = Date.now()
  const byStage: Record<string, number> = {}
  const byDepartment: Record<string, number> = {}
  const firstResponseMinutes: number[] = []
  const resolutionMinutes: number[] = []
  let open = 0
  let unassigned = 0
  let overdueSla = 0
  let converted = 0
  let closed = 0
  for (const inquiry of inquiries) {
    byStage[inquiry.stage] = (byStage[inquiry.stage] || 0) + 1
    const ticket = inquiry.ticket
    const inquiryClosed = isClosedInquiryStage(inquiry.stage)
    if (inquiryClosed) closed += 1
    else open += 1
    const allWorkItems = ticket?.workItems || []
    const activeWorkItems = allWorkItems.filter((item) => item.status === 'ACTIVE')
    const historicalDepartments = new Set(allWorkItems.map((item) => item.departmentId).filter((value): value is number => value != null))
    if (historicalDepartments.size === 0 && inquiry.departmentId != null) historicalDepartments.add(inquiry.departmentId)
    if (historicalDepartments.size === 0) byDepartment.unassigned = (byDepartment.unassigned || 0) + 1
    else for (const historicalDepartmentId of historicalDepartments) byDepartment[String(historicalDepartmentId)] = (byDepartment[String(historicalDepartmentId)] || 0) + 1
    if (!inquiryClosed && (activeWorkItems.length === 0 || activeWorkItems.some((item) => !item.assignedUserId && !item.claimedByUserId))) unassigned += 1
    if (!isClosedInquiryStage(inquiry.stage) && inquiry.slaDueAt && inquiry.slaDueAt.getTime() < now) overdueSla += 1
    if (isConvertedEvolutionInquiry(inquiry)) converted += 1
    const measuredResponse = measuredFirstResponseMinutes(inquiry.openedAt, messagesByGroup.get(inquiry.groupId) || [])
    if (measuredResponse != null) firstResponseMinutes.push(measuredResponse)
    const resolvedAt = ticket?.resolvedAt || ticket?.closedAt || inquiry.closedAt
    if (resolvedAt) resolutionMinutes.push((resolvedAt.getTime() - inquiry.openedAt.getTime()) / 60_000)
  }
  const sent = campaignRecipients.filter((recipient) => Boolean(recipient.sentAt)).length
  const delivered = campaignRecipients.filter((recipient) => Boolean(recipient.deliveredAt)).length
  const read = campaignRecipients.filter((recipient) => Boolean(recipient.readAt)).length
  const replied = campaignRecipients.filter((recipient) => Boolean(recipient.repliedAt)).length
  const routingFallbacks = routingAudits.filter((audit) => audit.routeType.toUpperCase() === 'DEFAULT').length
  const routingConfidence = routingAudits.filter((audit) => typeof audit.confidence === 'number').map((audit) => audit.confidence as number)
  const handoffs = agentRuns.filter((run) => run.handoff || run.status === 'HANDOFF').length
  const agentFailures = agentRuns.filter((run) => run.status === 'FAILED').length
  const fulfillment = {
    totalOrders: fulfillmentOrders.length,
    paymentPending: fulfillmentOrders.filter((order) => order.paymentStatus !== 'PAID' && !['CANCELLED', 'DELIVERED', 'RETURNED'].includes(order.status)).length,
    advanceTerms: fulfillmentOrders.filter((order) => (order.dealer.creditDays || 0) <= 0).length,
    creditTerms: fulfillmentOrders.filter((order) => (order.dealer.creditDays || 0) > 0).length,
    allocated: fulfillmentOrders.filter((order) => order.status === 'ALLOCATED').length,
    dispatchPending: fulfillmentOrders.filter((order) => ['APPROVED', 'ALLOCATED'].includes(order.status)).length,
    dispatched: fulfillmentOrders.filter((order) => order.status === 'DISPATCHED').length,
    delivered: fulfillmentOrders.filter((order) => order.status === 'DELIVERED').length,
    due1: fulfillmentOrders.filter((order) => !['DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status) && (() => { const count = dispatchCountdown(order.expectedDispatchDate); return count.state !== 'OVERDUE' && count.daysRemaining != null && count.daysRemaining <= 1 })()).length,
    due3: fulfillmentOrders.filter((order) => !['DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status) && (() => { const count = dispatchCountdown(order.expectedDispatchDate); return count.state !== 'OVERDUE' && count.daysRemaining != null && count.daysRemaining <= 3 })()).length,
    due7: fulfillmentOrders.filter((order) => !['DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status) && (() => { const count = dispatchCountdown(order.expectedDispatchDate); return count.state !== 'OVERDUE' && count.daysRemaining != null && count.daysRemaining <= 7 })()).length,
    overdueDispatch: fulfillmentOrders.filter((order) => !['DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status) && dispatchCountdown(order.expectedDispatchDate).state === 'OVERDUE').length,
    missingLogisticReceipt: fulfillmentOrders.filter((order) => ['DISPATCHED', 'DELIVERED'].includes(order.status) && !order.logisticReceiptUrl).length,
  }

  return NextResponse.json({
    data: {
      range: { from: from.toISOString(), to: until.toISOString(), departmentId: departmentId || null },
      inquiries: {
        total: inquiries.length, open, closed, unassigned, overdueSla, overdueFollowUps, converted,
        conversionRate: inquiries.length ? Number(((converted / inquiries.length) * 100).toFixed(2)) : 0,
        byStage, byDepartment,
      },
      response: {
        measured: firstResponseMinutes.length,
        medianFirstResponseMinutes: median(firstResponseMinutes),
        p95FirstResponseMinutes: percentile(firstResponseMinutes, 95),
        medianResolutionMinutes: median(resolutionMinutes),
        p95ResolutionMinutes: percentile(resolutionMinutes, 95),
      },
      campaigns: {
        recipients: campaignRecipients.length, sent, delivered, read, replied,
        deliveryRate: sent ? Number(((delivered / sent) * 100).toFixed(2)) : 0,
        readRate: delivered ? Number(((read / delivered) * 100).toFixed(2)) : 0,
        responseRate: sent ? Number(((replied / sent) * 100).toFixed(2)) : 0,
      },
      routing: {
        auditedEvents: routingAudits.length,
        fallbackCount: routingFallbacks,
        fallbackRate: routingAudits.length ? Number(((routingFallbacks / routingAudits.length) * 100).toFixed(2)) : 0,
        averageConfidence: routingConfidence.length ? Number((routingConfidence.reduce((sum, value) => sum + value, 0) / routingConfidence.length).toFixed(3)) : null,
      },
      rag: {
        runs: agentRuns.length,
        handoffs,
        handoffRate: agentRuns.length ? Number(((handoffs / agentRuns.length) * 100).toFixed(2)) : 0,
        failures: agentFailures,
      },
      fulfillment,
    },
  })
}
