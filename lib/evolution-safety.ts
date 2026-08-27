import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'

export type EvolutionOutboundCategory = 'MANUAL' | 'RAG' | 'FOLLOW_UP' | 'CATALOG' | 'CAMPAIGN'

export interface EvolutionSafeSendInput {
  ownerUserId?: number
  groupJid: string
  category?: EvolutionOutboundCategory
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export class EvolutionSafetyBlockedError extends Error {
  readonly status = 429

  constructor(message: string) {
    super(message)
    this.name = 'EvolutionSafetyBlockedError'
  }
}

const automatedCategories = new Set<EvolutionOutboundCategory>(['RAG', 'FOLLOW_UP', 'CATALOG', 'CAMPAIGN'])
const localLocks = new Map<string, Promise<void>>()

export function evolutionSafetyBlockReason(config: {
  allOutboundPaused: boolean
  automationPaused: boolean
  pauseReason: string | null
  circuitOpenUntil: Date | null
  circuitReason: string | null
}, category: EvolutionOutboundCategory, now = new Date()): string | null {
  if (config.allOutboundPaused) return `All WhatsApp sending is paused${config.pauseReason ? `: ${config.pauseReason}` : ''}`
  if (automatedCategories.has(category) && config.automationPaused) return `WhatsApp automation is paused${config.pauseReason ? `: ${config.pauseReason}` : ''}`
  if ((automatedCategories.has(category) || config.circuitReason?.startsWith('Connection state:')) && config.circuitOpenUntil && config.circuitOpenUntil > now) {
    return `WhatsApp automation circuit is open until ${config.circuitOpenUntil.toISOString()}${config.circuitReason ? `: ${config.circuitReason}` : ''}`
  }
  return null
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function providerMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
  const nestedKey = data.key && typeof data.key === 'object' ? data.key as Record<string, unknown> : {}
  return typeof key.id === 'string' && key.id ? key.id : typeof nestedKey.id === 'string' && nestedKey.id ? nestedKey.id : null
}

async function resolveOwnerUserId(configured?: number): Promise<number> {
  if (Number.isInteger(configured) && Number(configured) > 0) return Number(configured)
  const fromEnvironment = Number(process.env.EVOLUTION_OWNER_USER_ID)
  if (Number.isInteger(fromEnvironment) && fromEnvironment > 0) return fromEnvironment
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { id: 'asc' }, select: { id: true } })
  if (!owner) throw new EvolutionSafetyBlockedError('No active Evolution owner is configured')
  return owner.id
}

export async function getOrCreateEvolutionSafetyConfig(ownerUserId: number) {
  return prisma.evolutionSafetyConfig.upsert({
    where: { userId: ownerUserId },
    update: {},
    create: { userId: ownerUserId },
  })
}

async function withLocalLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = localLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.catch(() => undefined).then(() => current)
  localLocks.set(key, queued)
  await previous.catch(() => undefined)
  try {
    return await work()
  } finally {
    release()
    if (localLocks.get(key) === queued) localLocks.delete(key)
  }
}

async function withDistributedLock<T>(ownerUserId: number, work: () => Promise<T>): Promise<T> {
  const key = `evolution:safety:outbound:${ownerUserId}`
  const token = randomUUID()
  const deadline = Date.now() + 45_000
  let acquired = false
  try {
    while (Date.now() < deadline) {
      const result = await redis.set(key, token, 'PX', 60_000, 'NX')
      if (result === 'OK') { acquired = true; break }
      await sleep(150)
    }
  } catch (error) {
    console.warn('[evolution/safety] Redis lock unavailable; using process-local serialization:', error instanceof Error ? error.message : error)
    return withLocalLock(key, work)
  }
  if (!acquired) throw new EvolutionSafetyBlockedError('WhatsApp sender is busy. Please retry shortly.')
  try {
    return await work()
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token).catch(() => undefined)
  }
}

async function assertPolicy(ownerUserId: number, category: EvolutionOutboundCategory) {
  let config = await getOrCreateEvolutionSafetyConfig(ownerUserId)
  const now = new Date()
  if (config.circuitOpenUntil && config.circuitOpenUntil <= now) {
    config = await prisma.evolutionSafetyConfig.update({
      where: { userId: ownerUserId },
      data: { circuitOpenUntil: null, circuitReason: null, consecutiveFailures: 0 },
    })
  }
  const blockReason = evolutionSafetyBlockReason(config, category, now)
  if (blockReason) throw new EvolutionSafetyBlockedError(blockReason)

  if (automatedCategories.has(category)) {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const [sent, failed] = await Promise.all([
      prisma.evolutionOutboundAttempt.count({ where: { ownerUserId, status: 'SENT', createdAt: { gte: since } } }),
      prisma.evolutionOutboundAttempt.count({ where: { ownerUserId, status: 'FAILED', createdAt: { gte: since } } }),
    ])
    const sample = sent + failed
    if (sample >= config.minimumFailureSample && failed / sample >= config.failureRateThreshold) {
      const circuitOpenUntil = new Date(Date.now() + 60 * 60 * 1000)
      await prisma.evolutionSafetyConfig.update({
        where: { userId: ownerUserId },
        data: { circuitOpenUntil, circuitReason: `Failure rate ${Math.round((failed / sample) * 100)}% across ${sample} recent sends` },
      })
      throw new EvolutionSafetyBlockedError('WhatsApp automation paused because the recent provider failure rate is unsafe')
    }
  }
  return config
}

/**
 * Serializes and meters every Evolution outbound provider call while keeping
 * the existing request/response contract intact for all current callers.
 */
export async function executeEvolutionSafeSend<T>(input: EvolutionSafeSendInput, send: () => Promise<T>): Promise<T> {
  // Provider adapter unit tests intentionally exercise the raw payload shape.
  if (process.env.NODE_ENV === 'test' && process.env.EVOLUTION_SAFETY_TEST_MODE !== 'true') return send()

  const ownerUserId = await resolveOwnerUserId(input.ownerUserId)
  const category = input.category ?? 'MANUAL'
  const idempotencyKey = input.idempotencyKey?.trim() || null
  if (idempotencyKey) {
    const existing = await prisma.evolutionOutboundAttempt.findUnique({ where: { idempotencyKey } })
    if (existing?.status === 'SENT') return { key: { id: existing.providerMessageId || `idempotent-${existing.id}` } } as T
    // BLOCKED means the safety layer rejected the operation before the
    // provider call. It is therefore safe to reuse the same business key once
    // the pause/circuit clears; FAILED remains non-retryable because delivery
    // may be ambiguous after a network timeout.
    if (existing?.status === 'BLOCKED') await prisma.evolutionOutboundAttempt.delete({ where: { id: existing.id } })
    else if (existing) throw new EvolutionSafetyBlockedError(`This WhatsApp send was already ${existing.status.toLowerCase()}; refresh before retrying`)
  }

  try {
    await assertPolicy(ownerUserId, category)
  } catch (error) {
    await prisma.evolutionOutboundAttempt.create({
      data: {
        ownerUserId, groupJid: input.groupJid, category, status: 'BLOCKED', idempotencyKey,
        error: error instanceof Error ? error.message.slice(0, 2_000) : 'Blocked by WhatsApp safety policy',
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
      },
    }).catch(() => undefined)
    throw error
  }

  const attempt = await prisma.evolutionOutboundAttempt.create({
    data: {
      ownerUserId, groupJid: input.groupJid, category, idempotencyKey,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  })
  const startedAt = Date.now()

  return withDistributedLock(ownerUserId, async () => {
    const config = await assertPolicy(ownerUserId, category)
    const minimumInterval = category === 'CAMPAIGN' ? config.campaignMinIntervalMs : config.globalMinIntervalMs
    if (config.lastOutboundAt) {
      const waitFor = minimumInterval - (Date.now() - config.lastOutboundAt.getTime())
      if (waitFor > 0) await sleep(Math.min(waitFor, 30_000))
    }
    try {
      const result = await send()
      const sentAt = new Date()
      await prisma.$transaction([
        prisma.evolutionOutboundAttempt.update({
          where: { id: attempt.id },
          data: { status: 'SENT', sentAt, durationMs: Date.now() - startedAt, providerMessageId: providerMessageId(result) },
        }),
        prisma.evolutionSafetyConfig.update({
          where: { userId: ownerUserId },
          data: { lastOutboundAt: sentAt, consecutiveFailures: 0 },
        }),
      ])
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Evolution provider send failed'
      const updated = await prisma.$transaction(async (tx) => {
        await tx.evolutionOutboundAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', error: message, durationMs: Date.now() - startedAt } })
        return tx.evolutionSafetyConfig.update({ where: { userId: ownerUserId }, data: { consecutiveFailures: { increment: 1 } } })
      })
      if (updated.consecutiveFailures >= updated.maxConsecutiveFailures) {
        await prisma.evolutionSafetyConfig.update({
          where: { userId: ownerUserId },
          data: { circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000), circuitReason: `${updated.consecutiveFailures} consecutive provider failures` },
        })
      }
      throw error
    }
  }).catch(async (error) => {
    if (error instanceof EvolutionSafetyBlockedError) {
      await prisma.evolutionOutboundAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING' }, data: { status: 'BLOCKED', error: error.message, durationMs: Date.now() - startedAt } })
    }
    throw error
  })
}

export function isEvolutionMarketingOptOut(text: string | null | undefined): boolean {
  const normalized = String(text || '').trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  return /^(stop|unsubscribe|opt out|cancel promotions?|no promotions?|band karo|बंद करो|मैसेज बंद करो)$/.test(normalized)
}
