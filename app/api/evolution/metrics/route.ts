import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { isClosedInquiryStage } from '@/lib/evolution-operations'

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

  const departmentId = session.user.role === 'STAFF' ? session.user.routingDepartmentId : (query.get('department_id') ? Number(query.get('department_id')) : null)
  if (departmentId != null && (!Number.isInteger(departmentId) || departmentId <= 0)) return NextResponse.json({ error: 'department_id must be a positive integer' }, { status: 400 })
  const inquiryWhere = {
    ownerUserId,
    ...(departmentId ? { departmentId } : {}),
    openedAt: { gte: from, lte: until },
  }

  const [inquiries, overdueFollowUps, campaignRecipients, routingAudits, agentRuns] = await Promise.all([
    prisma.evolutionDealerInquiry.findMany({
      where: inquiryWhere,
      select: {
        id: true, stage: true, departmentId: true, dealerId: true, openedAt: true, slaDueAt: true, nextFollowUpAt: true, closedAt: true, convertedOrderId: true,
        ticket: { select: { assignedUserId: true, firstResponseAt: true, resolvedAt: true, closedAt: true } },
      },
      take: 10_000,
    }),
    prisma.evolutionTicketFollowUp.count({
      where: {
        status: 'PENDING', scheduledFor: { lt: new Date() },
        ticket: { group: { userId: ownerUserId, ...(departmentId ? { departmentId } : {}) } },
      },
    }),
    prisma.evolutionCampaignRecipient.findMany({
      where: { campaign: { userId: ownerUserId }, createdAt: { gte: from, lte: until } },
      select: { status: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true },
      take: 10_000,
    }),
    prisma.evolutionRoutingAudit.findMany({
      where: { ticket: { group: { userId: ownerUserId } }, createdAt: { gte: from, lte: until } },
      select: { routeType: true, confidence: true, event: true },
      take: 10_000,
    }),
    prisma.evolutionAgentRun.findMany({
      where: { ticket: { is: { group: { is: { userId: ownerUserId } } } }, createdAt: { gte: from, lte: until } },
      select: { status: true, confidence: true, handoff: true },
      take: 10_000,
    }),
  ])

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
    byDepartment[String(inquiry.departmentId || 'unassigned')] = (byDepartment[String(inquiry.departmentId || 'unassigned')] || 0) + 1
    const ticket = inquiry.ticket
    if (isClosedInquiryStage(inquiry.stage)) closed += 1
    else open += 1
    if (!ticket?.assignedUserId) unassigned += 1
    if (!isClosedInquiryStage(inquiry.stage) && inquiry.slaDueAt && inquiry.slaDueAt.getTime() < now) overdueSla += 1
    if (inquiry.convertedOrderId || ['CONFIRMED', 'PAYMENT_PENDING', 'ALLOCATED', 'DISPATCH_PENDING', 'DISPATCHED', 'DELIVERED'].includes(inquiry.stage)) converted += 1
    if (ticket?.firstResponseAt) firstResponseMinutes.push((ticket.firstResponseAt.getTime() - inquiry.openedAt.getTime()) / 60_000)
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
        medianFirstResponseMinutes: percentile(firstResponseMinutes, 50),
        p95FirstResponseMinutes: percentile(firstResponseMinutes, 95),
        medianResolutionMinutes: percentile(resolutionMinutes, 50),
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
    },
  })
}
