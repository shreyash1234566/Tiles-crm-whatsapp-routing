import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { prisma } from '@/lib/db'
import { getUploadFilePath } from '@/lib/r2'
import { recordEvolutionWorkerMetric } from '@/lib/evolution-worker-metrics'

const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const VISION_MODEL = process.env.EVOLUTION_VISION_MODEL || 'Xenova/clip-vit-base-patch16'

export function isEvolutionVisionEnabled() { return process.env.EVOLUTION_VISION_ENABLED === 'true' }

function localUploadPath(url: string): string {
  if (!url.startsWith('/api/uploads/')) throw new Error('Vision processing only accepts CRM-local uploaded images')
  return getUploadFilePath(url.slice('/api/uploads/'.length))
}

function normalize(vector: ArrayLike<number>): number[] {
  const values = Array.from(vector, Number)
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Vision model returned an invalid embedding')
  return values.map((value) => value / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  return a.reduce((sum, value, index) => sum + value * b[index], 0)
}

export function visionConfidenceBand(score: number): 'HIGH' | 'REVIEW' | 'LOW' {
  if (score >= 0.88) return 'HIGH'
  if (score >= 0.72) return 'REVIEW'
  return 'LOW'
}

async function embedLocalImage(sourceUrl: string): Promise<{ hash: string; embedding: number[] }> {
  const path = localUploadPath(sourceUrl)
  const bytes = await readFile(path)
  if (!bytes.length) throw new Error('Vision image is empty')
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Vision image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`)
  const transformers = await import('@xenova/transformers')
  const image = await transformers.RawImage.read(path)
  const processor = await transformers.AutoProcessor.from_pretrained(VISION_MODEL)
  const model = await transformers.CLIPVisionModelWithProjection.from_pretrained(VISION_MODEL, { quantized: true })
  const output = await model(await processor(image))
  return { hash: createHash('sha256').update(bytes).digest('hex'), embedding: normalize(output.image_embeds.data) }
}

export async function indexEvolutionLotMedia(input: { ownerUserId: number; lotMediaId: string; jobId?: string }) {
  if (!isEvolutionVisionEnabled()) throw new Error('Local vision is disabled. Set EVOLUTION_VISION_ENABLED=true after downloading/validating the model.')
  const started = Date.now()
  const media = await prisma.stoneLotMedia.findFirst({ where: { id: input.lotMediaId, mediaType: { in: ['IMAGE', 'image'] }, shareable: true, lot: { shareable: true } }, select: { id: true, url: true, lot: { select: { product: { select: { catalogItems: { where: { source: { userId: input.ownerUserId }, active: true, shareable: true }, select: { id: true }, take: 1 } } } } } } })
  if (!media) throw new Error('Dealer-shareable lot media was not found')
  const catalogItemId = media.lot.product.catalogItems[0]?.id
  if (!catalogItemId) throw new Error('Link this lot product to a dealer-shareable catalog item before indexing media')
  try {
    const { hash, embedding } = await embedLocalImage(media.url)
    const result = await prisma.evolutionVisionEmbedding.upsert({
      where: { userId_model_sourceHash_catalogItemId: { userId: input.ownerUserId, model: VISION_MODEL, sourceHash: hash, catalogItemId } },
      create: { userId: input.ownerUserId, catalogItemId, lotMediaId: media.id, sourceUrl: media.url, sourceHash: hash, model: VISION_MODEL, dimension: embedding.length, embedding },
      update: { catalogItemId, lotMediaId: media.id, sourceUrl: media.url, dimension: embedding.length, embedding },
    })
    await recordEvolutionWorkerMetric({ userId: input.ownerUserId, queue: 'evolution-vision', jobId: input.jobId, operation: 'index_lot_media', status: 'SUCCEEDED', durationMs: Date.now() - started, metadata: { lotMediaId: media.id, embeddingId: result.id, model: VISION_MODEL, dimension: embedding.length } })
    return result
  } catch (error) {
    await recordEvolutionWorkerMetric({ userId: input.ownerUserId, queue: 'evolution-vision', jobId: input.jobId, operation: 'index_lot_media', status: 'FAILED', durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Vision indexing failed', metadata: { lotMediaId: media.id } })
    throw error
  }
}

export async function matchEvolutionGroupImage(input: { ownerUserId: number; groupId: string; requestedMessageId: string; sourceUrl: string; jobId?: string }) {
  if (!isEvolutionVisionEnabled()) throw new Error('Local vision is disabled. Set EVOLUTION_VISION_ENABLED=true after downloading/validating the model.')
  const started = Date.now()
  try {
    const group = await prisma.evolutionGroup.findFirst({ where: { id: input.groupId, userId: input.ownerUserId }, include: { inquiry: { include: { dealer: { select: { priceTier: true } } } } } })
    if (!group?.inquiry?.dealer) throw new Error('Vision matches require a dealer-linked group')
    const { hash, embedding } = await embedLocalImage(input.sourceUrl)
    const candidates = await prisma.evolutionVisionEmbedding.findMany({
      where: { userId: input.ownerUserId, model: VISION_MODEL, catalogItem: { active: true, shareable: true, source: { isActive: true, userId: input.ownerUserId }, ...(group.inquiry.dealer.priceTier ? { OR: [{ dealerPriceTier: null }, { dealerPriceTier: group.inquiry.dealer.priceTier }] } : { dealerPriceTier: null }) } },
      select: { id: true, embedding: true, catalogItem: { select: { id: true, sku: true, name: true, lotNumber: true, shadeCode: true } } }, take: 2_000,
    })
    const ranked = candidates.map((candidate) => ({ candidate, score: cosineSimilarity(embedding, candidate.embedding as number[]) })).sort((a, b) => b.score - a.score).slice(0, 5)
    const matches = await prisma.$transaction(async (tx) => {
      await tx.evolutionVisionMatch.deleteMany({ where: { userId: input.ownerUserId, groupId: input.groupId, requestedMessageId: input.requestedMessageId, querySourceHash: hash, status: 'SUGGESTED' } })
      return Promise.all(ranked.map(({ candidate, score }) => tx.evolutionVisionMatch.create({
        data: { userId: input.ownerUserId, groupId: input.groupId, requestedMessageId: input.requestedMessageId, querySourceUrl: input.sourceUrl, querySourceHash: hash, candidateId: candidate.id, score, confidenceBand: visionConfidenceBand(score) },
        include: { candidate: { include: { catalogItem: { select: { id: true, sku: true, name: true, lotNumber: true, shadeCode: true } } } } },
      })))
    })
    await recordEvolutionWorkerMetric({ userId: input.ownerUserId, queue: 'evolution-vision', jobId: input.jobId, operation: 'match_group_image', status: 'SUCCEEDED', durationMs: Date.now() - started, metadata: { groupId: input.groupId, requestedMessageId: input.requestedMessageId, matchCount: matches.length, model: VISION_MODEL } })
    return matches
  } catch (error) {
    await recordEvolutionWorkerMetric({ userId: input.ownerUserId, queue: 'evolution-vision', jobId: input.jobId, operation: 'match_group_image', status: 'FAILED', durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Vision matching failed', metadata: { groupId: input.groupId, requestedMessageId: input.requestedMessageId } })
    throw error
  }
}
