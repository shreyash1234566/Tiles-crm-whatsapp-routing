import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { buildDealerSafeCatalogDraft } from '@/lib/evolution-catalog'
import { canAccessDepartmentWorkItem, isRoutingManager } from '@/lib/evolution-work-items'

const safeItemSelect = {
  id: true, sku: true, name: true, materialCategory: true, tileSize: true, unitOfMeasure: true, finish: true, applicationArea: true,
  dealerPriceTier: true, dealerRate: true, minimumQuantity: true, availableQuantity: true, stockStatus: true, lotNumber: true, shadeCode: true, photoUrls: true, videoUrls: true,
} as const

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const groupId = new URL(request.url).searchParams.get('group_id') || ''
  if (!groupId) return NextResponse.json({ error: 'group_id is required' }, { status: 400 })
  const group = await prisma.evolutionGroup.findFirst({ where: { id: groupId, userId: ownerId }, include: { ticket: true } })
  if (!group?.ticket) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (!isRoutingManager(session.user)) {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({ where: { ticketId: group.ticket.id, departmentId: session.user.routingDepartmentId ?? -1, status: 'ACTIVE' }, select: { departmentId: true, assignedUserId: true, claimedByUserId: true } })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This group is not available to your department' }, { status: 403 })
  }
  const data = await prisma.evolutionCatalogResponseDraft.findMany({ where: { groupId: group.id, userId: ownerId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, catalogItemIds: true, mediaUrls: true, mediaTypes: true, content: true, confidence: true, status: true, approvedByUserId: true, approvedAt: true, rejectionReason: true, providerMessageId: true, sentAt: true, createdAt: true, updatedAt: true } })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { groupId?: unknown; catalogItemIds?: unknown; note?: unknown; confidence?: unknown; requestedMessageId?: unknown }
  const groupId = String(body.groupId || '').trim()
  const itemIds = Array.isArray(body.catalogItemIds) ? [...new Set(body.catalogItemIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 3) : []
  if (!groupId || !itemIds.length) return NextResponse.json({ error: 'A group and at least one catalog item are required' }, { status: 400 })
  const group = await prisma.evolutionGroup.findFirst({ where: { id: groupId, userId: ownerId }, include: { ticket: true, inquiry: { include: { dealer: { select: { priceTier: true } } } } } })
  if (!group?.ticket) return NextResponse.json({ error: 'Routed dealer group not found' }, { status: 404 })
  if (!group.inquiry?.dealer) return NextResponse.json({ error: 'Link this WhatsApp group to a dealer before preparing catalog responses' }, { status: 409 })
  if (!isRoutingManager(session.user)) {
    const workItem = await prisma.evolutionDepartmentWorkItem.findFirst({ where: { ticketId: group.ticket.id, departmentId: session.user.routingDepartmentId ?? -1, status: 'ACTIVE' }, select: { departmentId: true, assignedUserId: true, claimedByUserId: true } })
    if (!workItem || !canAccessDepartmentWorkItem(session.user, workItem)) return NextResponse.json({ error: 'This group is not available to your department' }, { status: 403 })
  }
  const items = await prisma.evolutionCatalogItem.findMany({ where: { id: { in: itemIds }, active: true, shareable: true, source: { userId: ownerId, isActive: true }, ...(group.inquiry.dealer.priceTier ? { OR: [{ dealerPriceTier: null }, { dealerPriceTier: group.inquiry.dealer.priceTier }] } : { dealerPriceTier: null }) }, select: safeItemSelect })
  if (items.length !== itemIds.length) return NextResponse.json({ error: 'One or more selected items are no longer dealer-shareable for this group' }, { status: 409 })
  const note = String(body.note || '').trim().slice(0, 800)
  const rawConfidence = Number(body.confidence)
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : null
  const media = items.flatMap((item) => [
    ...item.photoUrls.map((url) => ({ url, type: 'image' })),
    ...item.videoUrls.map((url) => ({ url, type: 'video' })),
  ]).filter((asset) => /^https:\/\//i.test(asset.url)).slice(0, 3)
  const draft = await prisma.evolutionCatalogResponseDraft.create({
    data: {
      userId: ownerId, groupId: group.id, ticketId: group.ticket.id, inquiryId: group.inquiry?.id || null,
      requestedMessageId: String(body.requestedMessageId || '').trim().slice(0, 250) || null,
      catalogItemIds: items.map((item) => item.id),
      mediaUrls: media.map((asset) => asset.url),
      mediaTypes: media.map((asset) => asset.type),
      content: buildDealerSafeCatalogDraft(items, note), confidence,
      sourceSummary: items.map((item) => ({ id: item.id, sku: item.sku, lotNumber: item.lotNumber, dealerRate: item.dealerRate, photoCount: item.photoUrls.length, videoCount: item.videoUrls.length })),
      status: 'DRAFT',
    },
  })
  return NextResponse.json({ data: draft }, { status: 201 })
}
