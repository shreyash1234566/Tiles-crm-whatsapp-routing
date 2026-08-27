import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getOrCreateEvolutionSafetyConfig } from '@/lib/evolution-safety'
import { getEvolutionCampaignQueue } from '@/lib/queues/jobs'

async function access() {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return { error: NextResponse.json({ error: 'Only an admin or manager can send an Evolution campaign' }, { status: 403 }) }
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  return { ownerUserId, session }
}

export async function GET() {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const data = await prisma.evolutionCampaign.findMany({
    where: { userId: resolved.ownerUserId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { recipients: { select: { id: true, groupJid: true, status: true, providerMessageId: true, responseMessageId: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true } } },
  })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => ({})) as { name?: string; text?: string; groupIds?: string[]; safetyConfirmed?: boolean }
  const name = String(body.name || '').trim()
  const text = String(body.text || '').trim()
  const groupIds = [...new Set(Array.isArray(body.groupIds) ? body.groupIds.map(String).map((value) => value.trim()).filter(Boolean) : [])]
  if (name.length < 2 || name.length > 160) return NextResponse.json({ error: 'name must be between 2 and 160 characters' }, { status: 400 })
  if (text.length < 2 || text.length > 4_000) return NextResponse.json({ error: 'text must be between 2 and 4000 characters' }, { status: 400 })
  if (groupIds.length === 0 || groupIds.length > 100) return NextResponse.json({ error: 'Select between 1 and 100 dealer groups' }, { status: 400 })
  if (body.safetyConfirmed !== true) return NextResponse.json({ error: 'Confirm that every selected dealer group opted in to this broadcast' }, { status: 400 })

  // A campaign can only target explicitly linked dealer inquiries. This keeps
  // broadcasts out of unknown groups and preserves the dealer-only B2B model.
  const groups = await prisma.evolutionGroup.findMany({
    where: { id: { in: groupIds }, userId: resolved.ownerUserId, status: 'open', inquiry: { is: { dealerId: { not: null } } } },
    select: { id: true, groupJid: true, inquiry: { select: { dealerId: true } } },
  })
  if (groups.length !== groupIds.length) return NextResponse.json({ error: 'Every selected target must be an open group explicitly linked to a dealer' }, { status: 400 })

  const safety = await getOrCreateEvolutionSafetyConfig(resolved.ownerUserId)
  if (safety.automationPaused || safety.allOutboundPaused || (safety.circuitOpenUntil && safety.circuitOpenUntil > new Date())) {
    return NextResponse.json({ error: 'Dealer broadcasts are paused by WhatsApp Safety. Review Routing Operations before sending.' }, { status: 423 })
  }
  const groupJids = groups.map((group) => group.groupJid)
  const identities = await prisma.dealerEvolutionIdentity.findMany({ where: { userId: resolved.ownerUserId, groupJid: { in: groupJids } } })
  const identityByGroup = new Map(identities.map((identity) => [identity.groupJid, identity]))
  const notConsented = groupJids.filter((groupJid) => {
    const identity = identityByGroup.get(groupJid)
    return !identity || identity.marketingConsentStatus !== 'OPTED_IN' || !identity.marketingOptInAt
  })
  if (notConsented.length > 0) return NextResponse.json({ error: `${notConsented.length} selected dealer group(s) do not have recorded marketing opt-in` }, { status: 400 })

  const cooldownSince = new Date(Date.now() - safety.campaignCooldownHours * 60 * 60 * 1000)
  const recentRecipients = await prisma.evolutionCampaignRecipient.findMany({
    where: { groupJid: { in: groupJids }, campaign: { userId: resolved.ownerUserId, createdAt: { gte: cooldownSince } }, status: { notIn: ['FAILED', 'BLOCKED'] } },
    select: { groupJid: true },
  })
  const recentGroups = new Set(recentRecipients.map((recipient) => recipient.groupJid))
  for (const identity of identities) if (identity.lastCampaignAt && identity.lastCampaignAt >= cooldownSince && identity.groupJid) recentGroups.add(identity.groupJid)
  if (recentGroups.size > 0) return NextResponse.json({ error: `${recentGroups.size} selected dealer group(s) are inside the ${safety.campaignCooldownHours}-hour campaign cooldown` }, { status: 409 })

  const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const reservedToday = await prisma.evolutionCampaignRecipient.count({
    where: { campaign: { userId: resolved.ownerUserId, createdAt: { gte: daySince } }, status: { notIn: ['FAILED', 'BLOCKED'] } },
  })
  const remainingToday = Math.max(0, safety.campaignDailyLimit - reservedToday)
  if (groupIds.length > remainingToday) return NextResponse.json({ error: `Daily broadcast safety limit allows ${remainingToday} more group(s) in the current 24-hour window` }, { status: 429 })

  const actorUserId = Number(resolved.session.user.id)

  const campaign = await prisma.evolutionCampaign.create({
    data: {
      userId: resolved.ownerUserId,
      name,
      message: text,
      status: 'QUEUED',
      approvedByUserId: actorUserId,
      approvedAt: new Date(),
      recipients: { create: groups.map((group) => ({ dealerId: group.inquiry?.dealerId || null, groupJid: group.groupJid })) },
    },
    include: { recipients: true },
  })

  try {
    await Promise.all(campaign.recipients.map((recipient) => getEvolutionCampaignQueue().add('send-dealer-campaign', { recipientId: recipient.id }, { jobId: `evolution-campaign:${recipient.id}` })))
  } catch (error) {
    const data = await prisma.evolutionCampaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' }, include: { recipients: true } })
    return NextResponse.json({ data, warning: `Campaign saved but the delivery queue is unavailable: ${error instanceof Error ? error.message : 'unknown error'}` }, { status: 202 })
  }
  return NextResponse.json({ data: campaign, queued: campaign.recipients.length }, { status: 202 })
}
