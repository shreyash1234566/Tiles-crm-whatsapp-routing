import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getOrCreateEvolutionSafetyConfig } from '@/lib/evolution-safety'

async function access() {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return { error: NextResponse.json({ error: 'Only an admin or manager can manage WhatsApp Safety' }, { status: 403 }) }
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return { error: NextResponse.json({ error: 'No active Evolution owner configured' }, { status: 503 }) }
  return { session, ownerUserId }
}

export async function GET() {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [config, grouped, recent, consent, dealerConsents, webhookHealth, campaignQueueStatuses] = await Promise.all([
    getOrCreateEvolutionSafetyConfig(resolved.ownerUserId),
    prisma.evolutionOutboundAttempt.groupBy({ by: ['category', 'status'], where: { ownerUserId: resolved.ownerUserId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.evolutionOutboundAttempt.findMany({ where: { ownerUserId: resolved.ownerUserId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, groupJid: true, category: true, status: true, error: true, durationMs: true, sentAt: true, createdAt: true } }),
    prisma.dealerEvolutionIdentity.groupBy({ by: ['marketingConsentStatus'], where: { userId: resolved.ownerUserId }, _count: { _all: true } }),
    prisma.dealerEvolutionIdentity.findMany({ where: { userId: resolved.ownerUserId, groupJid: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, groupJid: true, marketingConsentStatus: true, marketingOptInAt: true, marketingOptOutAt: true, consentSource: true, consentEvidence: true, lastCampaignAt: true, dealer: { select: { businessName: true, contactPerson: true } } } }),
    prisma.evolutionWebhookHealth.findUnique({ where: { ownerUserId: resolved.ownerUserId } }),
    prisma.evolutionCampaignRecipient.groupBy({ by: ['status'], where: { campaign: { userId: resolved.ownerUserId }, createdAt: { gte: since } }, _count: { _all: true } }),
  ])
  const totals = grouped.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + row._count._all
    return result
  }, {} as Record<string, number>)
  const completed = (totals.SENT || 0) + (totals.FAILED || 0)
  return NextResponse.json({
    data: {
      config,
      last24Hours: { totals, byCategory: grouped, failureRate: completed ? Math.round(((totals.FAILED || 0) / completed) * 1_000) / 10 : 0 },
      consent: Object.fromEntries(consent.map((row) => [row.marketingConsentStatus, row._count._all])),
      dealerConsents,
      queue: {
        waiting: campaignQueueStatuses.find((row) => row.status === 'PENDING')?._count._all || 0,
        active: campaignQueueStatuses.find((row) => row.status === 'PROCESSING')?._count._all || 0,
        delayed: 0,
        failed: campaignQueueStatuses.find((row) => row.status === 'FAILED')?._count._all || 0,
        completed: campaignQueueStatuses.filter((row) => ['SENT', 'DELIVERED', 'READ', 'REPLIED'].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0),
      },
      webhookHealth,
      recent,
      circuitActive: Boolean(config.circuitOpenUntil && config.circuitOpenUntil > new Date()),
    },
  })
}

function integer(value: unknown, minimum: number, maximum: number, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`)
  return parsed
}

export async function PATCH(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  try {
    const data = await prisma.evolutionSafetyConfig.upsert({
      where: { userId: resolved.ownerUserId },
      create: {
        userId: resolved.ownerUserId,
        globalMinIntervalMs: integer(body.globalMinIntervalMs, 500, 30_000, 'globalMinIntervalMs'),
        campaignMinIntervalMs: integer(body.campaignMinIntervalMs, 2_500, 60_000, 'campaignMinIntervalMs'),
        campaignDailyLimit: integer(body.campaignDailyLimit, 1, 200, 'campaignDailyLimit'),
        campaignCooldownHours: integer(body.campaignCooldownHours, 1, 720, 'campaignCooldownHours'),
        maxConsecutiveFailures: integer(body.maxConsecutiveFailures, 1, 20, 'maxConsecutiveFailures'),
        failureRateThreshold: integer(body.failureRatePercent, 5, 100, 'failureRatePercent') / 100,
        minimumFailureSample: integer(body.minimumFailureSample, 3, 100, 'minimumFailureSample'),
      },
      update: {
        globalMinIntervalMs: integer(body.globalMinIntervalMs, 500, 30_000, 'globalMinIntervalMs'),
        campaignMinIntervalMs: integer(body.campaignMinIntervalMs, 2_500, 60_000, 'campaignMinIntervalMs'),
        campaignDailyLimit: integer(body.campaignDailyLimit, 1, 200, 'campaignDailyLimit'),
        campaignCooldownHours: integer(body.campaignCooldownHours, 1, 720, 'campaignCooldownHours'),
        maxConsecutiveFailures: integer(body.maxConsecutiveFailures, 1, 20, 'maxConsecutiveFailures'),
        failureRateThreshold: integer(body.failureRatePercent, 5, 100, 'failureRatePercent') / 100,
        minimumFailureSample: integer(body.minimumFailureSample, 3, 100, 'minimumFailureSample'),
      },
    })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid WhatsApp Safety settings' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => ({})) as { action?: unknown; reason?: unknown; groupJid?: unknown; evidence?: unknown }
  const action = String(body.action || '').trim().toLowerCase()
  const reason = String(body.reason || '').trim().slice(0, 500)
  const actorUserId = Number(resolved.session.user.id)
  if (action === 'record_opt_in' || action === 'record_opt_out') {
    const groupJid = String(body.groupJid || '').trim().toLowerCase()
    const evidence = String(body.evidence || '').trim().slice(0, 1_000)
    if (!groupJid) return NextResponse.json({ error: 'groupJid is required' }, { status: 400 })
    if (action === 'record_opt_in' && !evidence) return NextResponse.json({ error: 'Paste or describe the dealer opt-in evidence' }, { status: 400 })
    const identity = await prisma.dealerEvolutionIdentity.findUnique({ where: { userId_groupJid: { userId: resolved.ownerUserId, groupJid } } })
    if (!identity) return NextResponse.json({ error: 'Linked dealer identity not found' }, { status: 404 })
    const now = new Date()
    const data = await prisma.dealerEvolutionIdentity.update({ where: { id: identity.id }, data: action === 'record_opt_in' ? { marketingConsentStatus: 'OPTED_IN', marketingOptInAt: now, marketingOptOutAt: null, consentSource: 'MANAGER_VERIFIED', consentEvidence: evidence } : { marketingConsentStatus: 'OPTED_OUT', marketingOptInAt: null, marketingOptOutAt: now, consentSource: 'MANAGER_ACTION', consentEvidence: evidence || 'Campaign messages disabled by manager' } })
    const group = await prisma.evolutionGroup.findUnique({ where: { userId_groupJid: { userId: resolved.ownerUserId, groupJid } }, select: { ticket: { select: { id: true, inquiryId: true } } } })
    if (group?.ticket) await prisma.evolutionRoutingAudit.create({ data: { ticketId: group.ticket.id, inquiryId: group.ticket.inquiryId, messageId: 'campaign-consent', actorUserId: Number.isInteger(actorUserId) ? actorUserId : null, event: action === 'record_opt_in' ? 'CAMPAIGN_OPT_IN' : 'CAMPAIGN_OPT_OUT', routeType: 'MANUAL', reason: action === 'record_opt_in' ? 'Manager recorded explicit dealer campaign consent' : 'Dealer campaign messages disabled', metadata: { evidence: data.consentEvidence } } })
    return NextResponse.json({ data })
  }
  const common = { pausedByUserId: Number.isInteger(actorUserId) ? actorUserId : null }
  let data
  if (action === 'pause_automation') data = { automationPaused: true, pauseReason: reason || 'Paused by manager', pausedAt: new Date(), ...common }
  else if (action === 'resume_automation') data = { automationPaused: false, pauseReason: null, pausedAt: null, ...common }
  else if (action === 'pause_all') data = { allOutboundPaused: true, automationPaused: true, pauseReason: reason || 'Emergency stop activated by manager', pausedAt: new Date(), ...common }
  else if (action === 'resume_all') data = { allOutboundPaused: false, automationPaused: false, pauseReason: null, pausedAt: null, ...common }
  else if (action === 'reset_circuit') data = { circuitOpenUntil: null, circuitReason: null, consecutiveFailures: 0 }
  else return NextResponse.json({ error: 'Unknown WhatsApp Safety action' }, { status: 400 })
  const config = await prisma.evolutionSafetyConfig.upsert({ where: { userId: resolved.ownerUserId }, create: { userId: resolved.ownerUserId, ...data }, update: data })
  return NextResponse.json({ data: config })
}
