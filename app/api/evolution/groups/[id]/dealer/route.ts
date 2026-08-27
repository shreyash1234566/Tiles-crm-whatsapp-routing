import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { normalizeEvolutionPhone } from '@/lib/evolution-operations'

async function getManagerGroup(id: string) {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return { error: NextResponse.json({ error: 'Only an admin or manager can link a dealer' }, { status: 403 }) }
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  const group = await prisma.evolutionGroup.findFirst({ where: { id, userId: ownerId }, include: { ticket: true, inquiry: { include: { dealer: true } } } })
  if (!group) return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) }
  return { session, ownerId, group }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await getManagerGroup(id)
  if ('error' in resolved) return resolved.error
  const identity = await prisma.dealerEvolutionIdentity.findUnique({ where: { userId_groupJid: { userId: resolved.ownerId, groupJid: resolved.group.groupJid } } })
  return NextResponse.json({ data: { inquiry: resolved.group.inquiry, identity } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await getManagerGroup(id)
  if ('error' in resolved) return resolved.error
  const { session, ownerId, group } = resolved
  const body = await request.json().catch(() => ({})) as { dealerId?: number | null }
  const dealerId = body.dealerId == null ? null : Number(body.dealerId)
  if (dealerId != null && (!Number.isInteger(dealerId) || dealerId <= 0)) return NextResponse.json({ error: 'dealerId must be a positive integer or null' }, { status: 400 })
  const dealer = dealerId == null ? null : await prisma.dealer.findUnique({ where: { id: dealerId }, select: { id: true, phone: true, alternatePhone: true, whatsappNumber: true } })
  if (dealerId != null && !dealer) return NextResponse.json({ error: 'Dealer not found' }, { status: 404 })
  const now = new Date()
  const actorUserId = Number(session.user.id)
  const result = await prisma.$transaction(async (tx) => {
    let inquiryId = group.inquiry?.id
    if (!inquiryId) {
      const inquiry = await tx.evolutionDealerInquiry.create({
        data: { groupId: group.id, ownerUserId: ownerId, dealerId, departmentId: group.departmentId, assignedUserId: group.assignedUserId, title: group.subject, lastActivityAt: now },
      })
      inquiryId = inquiry.id
    } else {
      await tx.evolutionDealerInquiry.update({ where: { id: inquiryId }, data: { dealerId, dealerPhone: dealer ? normalizeEvolutionPhone(dealer.whatsappNumber || dealer.phone || dealer.alternatePhone) || null : null, lastActivityAt: now } })
    }
    let ticketId = group.ticket?.id
    if (!ticketId) {
      const ticket = await tx.evolutionGroupTicket.create({ data: { groupId: group.id, inquiryId, departmentId: group.departmentId, departmentName: group.departmentName, assignedUserId: group.assignedUserId, routeType: group.routeType } })
      ticketId = ticket.id
    } else {
      await tx.evolutionGroupTicket.update({ where: { id: ticketId }, data: { inquiryId, version: { increment: 1 } } })
    }
    if (dealer) {
      const phone = normalizeEvolutionPhone(dealer.whatsappNumber || dealer.phone || dealer.alternatePhone)
      await tx.dealerEvolutionIdentity.upsert({
        where: { userId_groupJid: { userId: ownerId, groupJid: group.groupJid } },
        update: { dealerId: dealer.id, phone: phone || null, verifiedAt: now, lastSeenAt: now },
        create: { userId: ownerId, dealerId: dealer.id, groupJid: group.groupJid, phone: phone || null, verifiedAt: now, lastSeenAt: now },
      })
    } else {
      await tx.dealerEvolutionIdentity.deleteMany({ where: { userId: ownerId, groupJid: group.groupJid } })
    }
    await tx.evolutionRoutingAudit.create({
      data: { ticketId, messageId: 'dealer-link', inquiryId, actorUserId: Number.isInteger(actorUserId) ? actorUserId : null, event: dealer ? 'DEALER_LINKED' : 'DEALER_UNLINKED', routeType: 'MANUAL', reason: dealer ? 'Dealer identity explicitly linked to group' : 'Dealer identity unlinked from group', metadata: { dealerId: dealer?.id || null } },
    })
    return { inquiryId, ticketId }
  })
  return NextResponse.json({ data: result })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const resolved = await getManagerGroup(id)
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => ({})) as { marketingConsentStatus?: unknown; consentSource?: unknown; consentEvidence?: unknown }
  const status = String(body.marketingConsentStatus || '').trim().toUpperCase()
  if (!['OPTED_IN', 'OPTED_OUT', 'UNKNOWN'].includes(status)) return NextResponse.json({ error: 'marketingConsentStatus must be OPTED_IN, OPTED_OUT, or UNKNOWN' }, { status: 400 })
  const consentSource = String(body.consentSource || '').trim().slice(0, 160)
  const consentEvidence = String(body.consentEvidence || '').trim().slice(0, 1_000)
  if (status === 'OPTED_IN' && (!consentSource || !consentEvidence)) return NextResponse.json({ error: 'Consent source and evidence are required before enabling dealer broadcasts' }, { status: 400 })
  const identity = await prisma.dealerEvolutionIdentity.findUnique({ where: { userId_groupJid: { userId: resolved.ownerId, groupJid: resolved.group.groupJid } } })
  if (!identity) return NextResponse.json({ error: 'Link this WhatsApp group to a dealer before recording campaign consent' }, { status: 409 })
  const now = new Date()
  const data = await prisma.dealerEvolutionIdentity.update({
    where: { id: identity.id },
    data: {
      marketingConsentStatus: status,
      consentSource: status === 'UNKNOWN' ? null : consentSource || (status === 'OPTED_OUT' ? 'DEALER_REQUEST' : null),
      consentEvidence: status === 'UNKNOWN' ? null : consentEvidence || (status === 'OPTED_OUT' ? 'Dealer opted out' : null),
      marketingOptInAt: status === 'OPTED_IN' ? now : null,
      marketingOptOutAt: status === 'OPTED_OUT' ? now : null,
    },
  })
  if (resolved.group.ticket) {
    const actorUserId = Number(resolved.session.user.id)
    await prisma.evolutionRoutingAudit.create({
      data: {
        ticketId: resolved.group.ticket.id,
        messageId: 'campaign-consent',
        inquiryId: resolved.group.inquiry?.id || null,
        actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
        event: status === 'OPTED_IN' ? 'CAMPAIGN_OPT_IN' : status === 'OPTED_OUT' ? 'CAMPAIGN_OPT_OUT' : 'CAMPAIGN_CONSENT_RESET',
        routeType: 'MANUAL',
        reason: status === 'OPTED_IN' ? 'Manager recorded explicit dealer campaign consent' : status === 'OPTED_OUT' ? 'Dealer campaign messages disabled' : 'Dealer campaign consent reset for review',
        metadata: { consentSource: data.consentSource, consentEvidence: data.consentEvidence },
      },
    })
  }
  return NextResponse.json({ data })
}
