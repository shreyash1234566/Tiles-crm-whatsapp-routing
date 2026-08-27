import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { catalogCodeCandidates, normalizeCatalogCode } from '@/lib/evolution-catalog'
import { canAccessDepartmentWorkItem, isRoutingManager } from '@/lib/evolution-work-items'

const itemSelect = {
  id: true, sku: true, name: true, category: true, materialCategory: true, tileSize: true, unitOfMeasure: true, finish: true, applicationArea: true,
  dealerPriceTier: true, dealerRate: true, minimumQuantity: true, availableQuantity: true, stockStatus: true, lotNumber: true, shadeCode: true, photoUrls: true, videoUrls: true,
} as const

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const query = new URL(request.url).searchParams
  const groupId = String(query.get('group_id') || '').trim()
  const term = String(query.get('q') || '').trim().slice(0, 120)
  if (!groupId || term.length < 2) return NextResponse.json({ error: 'group_id and a search query of at least 2 characters are required' }, { status: 400 })
  const group = await prisma.evolutionGroup.findFirst({ where: { id: groupId, userId: ownerId }, include: { ticket: true, inquiry: { include: { dealer: { select: { priceTier: true } } } } } })
  if (!group?.ticket) return NextResponse.json({ error: 'Routed dealer group not found' }, { status: 404 })
  if (!group.inquiry?.dealer) return NextResponse.json({ error: 'Link this WhatsApp group to a dealer before searching the dealer catalog' }, { status: 409 })
  if (!isRoutingManager(session.user)) {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({ where: { ticketId: group.ticket.id, departmentId: session.user.routingDepartmentId ?? -1, status: 'ACTIVE' }, select: { departmentId: true, assignedUserId: true, claimedByUserId: true } })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This group is not available to your department' }, { status: 403 })
  }
  const codeCandidates = catalogCodeCandidates(term)
  // An empty candidate list means this is a name/attribute search, not an
  // exact-code lookup.  Omitting the SKU predicate would otherwise return the
  // first arbitrary catalog rows and incorrectly report `exactCodeMatch=true`.
  const exact = codeCandidates.length
    ? await prisma.evolutionCatalogItem.findMany({
      where: {
        active: true, shareable: true, source: { userId: ownerId, isActive: true },
        ...(group.inquiry.dealer.priceTier ? { OR: [{ dealerPriceTier: null }, { dealerPriceTier: group.inquiry.dealer.priceTier }] } : { dealerPriceTier: null }),
        normalizedSku: { in: codeCandidates },
      }, select: itemSelect, take: 12,
    })
    : []
  const matches = exact.length ? exact : await prisma.evolutionCatalogItem.findMany({
    where: {
      active: true, shareable: true, source: { userId: ownerId, isActive: true },
      ...(group.inquiry.dealer.priceTier ? { OR: [{ dealerPriceTier: null }, { dealerPriceTier: group.inquiry.dealer.priceTier }] } : { dealerPriceTier: null }),
      OR: [{ sku: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }, { normalizedSku: { contains: normalizeCatalogCode(term) } }],
    }, select: itemSelect, take: 12,
  })
  return NextResponse.json({ data: { group: { id: group.id, dealerPriceTier: group.inquiry?.dealer?.priceTier || null }, exactCodeMatch: exact.length > 0, items: matches } })
}
