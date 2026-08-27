import { prisma } from '@/lib/db'
import { buildDealerSafeCatalogDraft, extractCatalogCodeCandidates } from '@/lib/evolution-catalog'

/**
 * Converts an unambiguous code query into a staff-review draft. It deliberately
 * performs no Evolution send, no reservation, and no Product/stock mutation.
 */
export async function createCatalogDraftForInbound(input: {
  ownerUserId: number
  groupId: string
  ticketId: string
  inquiryId: string | null
  // Evolution's provider ID is used for dedupe and quoted replies. The local
  // CRM row id must never be sent back to Evolution as a quoted-message key.
  providerMessageId: string
  text: string | null
}) {
  const candidates = extractCatalogCodeCandidates(input.text)
  if (!candidates.length) return null
  const existing = await prisma.evolutionCatalogResponseDraft.findFirst({ where: { userId: input.ownerUserId, groupId: input.groupId, requestedMessageId: input.providerMessageId, status: { in: ['DRAFT', 'APPROVED', 'SENDING', 'SENT'] } }, select: { id: true } })
  if (existing) return null
  const inquiry = input.inquiryId ? await prisma.evolutionDealerInquiry.findUnique({ where: { id: input.inquiryId }, include: { dealer: { select: { priceTier: true } } } }) : null
  // Do not create a generic public-price draft for an unlinked group. A
  // group must be explicitly linked to a dealer before catalog data is used.
  if (!inquiry?.dealer) return null
  const items = await prisma.evolutionCatalogItem.findMany({
    where: {
      normalizedSku: { in: candidates }, active: true, shareable: true,
      source: { userId: input.ownerUserId, isActive: true },
      ...(inquiry.dealer.priceTier ? { OR: [{ dealerPriceTier: null }, { dealerPriceTier: inquiry.dealer.priceTier }] } : { dealerPriceTier: null }),
    },
    select: { id: true, normalizedSku: true, sku: true, name: true, materialCategory: true, tileSize: true, unitOfMeasure: true, finish: true, applicationArea: true, dealerPriceTier: true, dealerRate: true, minimumQuantity: true, availableQuantity: true, stockStatus: true, lotNumber: true, shadeCode: true, photoUrls: true, videoUrls: true },
    take: 3,
  })
  if (!items.length) return null
  // Only a single exact hit merits high confidence. OCR variants and multiple
  // SKUs are deliberately marked for manager judgement, never auto-sent.
  const confidence = items.length === 1 && items[0].normalizedSku === candidates[0] ? 1 : 0.65
  const media = items.flatMap((item) => [
    ...item.photoUrls.map((url) => ({ url, type: 'image' })),
    ...item.videoUrls.map((url) => ({ url, type: 'video' })),
  ]).filter((asset) => /^https:\/\//i.test(asset.url)).slice(0, 3)
  let draft
  try {
    draft = await prisma.evolutionCatalogResponseDraft.create({
      data: {
        userId: input.ownerUserId, groupId: input.groupId, ticketId: input.ticketId, inquiryId: input.inquiryId,
        requestedMessageId: input.providerMessageId, catalogItemIds: items.map((item) => item.id),
        mediaUrls: media.map((asset) => asset.url),
        mediaTypes: media.map((asset) => asset.type),
        content: buildDealerSafeCatalogDraft(items), confidence,
        sourceSummary: items.map((item) => ({ id: item.id, sku: item.sku, lotNumber: item.lotNumber, dealerRate: item.dealerRate, automaticCodeMatch: true })), status: 'DRAFT',
      },
    })
  } catch (error) {
    // The unique group/provider-message key makes duplicate webhook delivery
    // idempotent even across app restarts or concurrent requests.
    if (error instanceof Error && error.message.includes('Unique constraint')) return null
    throw error
  }
  await prisma.evolutionRoutingAudit.create({ data: { ticketId: input.ticketId, messageId: input.providerMessageId, inquiryId: input.inquiryId, event: 'CATALOG_DRAFT_CREATED', routeType: 'CATALOG', confidence, reason: 'Dealer-shareable catalog code match prepared for approval', metadata: { catalogDraftId: draft.id, catalogItemIds: draft.catalogItemIds } } })
  return draft
}
