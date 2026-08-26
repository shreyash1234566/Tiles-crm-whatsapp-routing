import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, sendEvolutionGroupText } from '@/lib/evolution-routing'

function providerMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  if (typeof key.id === 'string' && key.id) return key.id
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
  const nestedKey = data.key && typeof data.key === 'object' ? data.key as Record<string, unknown> : {}
  return typeof nestedKey.id === 'string' && nestedKey.id ? nestedKey.id : null
}

async function access() {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return { error: NextResponse.json({ error: 'Only an admin or manager can send an Evolution campaign' }, { status: 403 }) }
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  return { ownerUserId }
}

export async function GET() {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const data = await prisma.evolutionCampaign.findMany({
    where: { userId: resolved.ownerUserId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { _count: { select: { recipients: true } } },
  })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => ({})) as { name?: string; text?: string; groupIds?: string[] }
  const name = String(body.name || '').trim()
  const text = String(body.text || '').trim()
  const groupIds = [...new Set(Array.isArray(body.groupIds) ? body.groupIds.map(String).map((value) => value.trim()).filter(Boolean) : [])]
  if (name.length < 2 || name.length > 160) return NextResponse.json({ error: 'name must be between 2 and 160 characters' }, { status: 400 })
  if (text.length < 2 || text.length > 4_000) return NextResponse.json({ error: 'text must be between 2 and 4000 characters' }, { status: 400 })
  if (groupIds.length === 0 || groupIds.length > 100) return NextResponse.json({ error: 'Select between 1 and 100 dealer groups' }, { status: 400 })

  // A campaign can only target explicitly linked dealer inquiries. This keeps
  // broadcasts out of unknown groups and preserves the dealer-only B2B model.
  const groups = await prisma.evolutionGroup.findMany({
    where: { id: { in: groupIds }, userId: resolved.ownerUserId, status: 'open', inquiry: { is: { dealerId: { not: null } } } },
    select: { id: true, groupJid: true, inquiry: { select: { dealerId: true } } },
  })
  if (groups.length !== groupIds.length) return NextResponse.json({ error: 'Every selected target must be an open group explicitly linked to a dealer' }, { status: 400 })

  const campaign = await prisma.evolutionCampaign.create({
    data: {
      userId: resolved.ownerUserId,
      name,
      status: 'SENDING',
      recipients: { create: groups.map((group) => ({ dealerId: group.inquiry?.dealerId || null, groupJid: group.groupJid })) },
    },
    include: { recipients: true },
  })

  let sent = 0
  const failures: Array<{ groupId: string; error: string }> = []
  for (const recipient of campaign.recipients) {
    try {
      const providerResponse = await sendEvolutionGroupText({ groupJid: recipient.groupJid, text })
      await prisma.evolutionCampaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: providerMessageId(providerResponse) },
      })
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evolution send failed'
      failures.push({ groupId: recipient.groupJid, error: message })
      await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED' } })
    }
  }
  const status = sent === groups.length ? 'SENT' : sent === 0 ? 'FAILED' : 'PARTIAL'
  const data = await prisma.evolutionCampaign.update({ where: { id: campaign.id }, data: { status }, include: { recipients: true } })
  return NextResponse.json({ data, failures }, { status: sent === 0 ? 502 : 201 })
}
