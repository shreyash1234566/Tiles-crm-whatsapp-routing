import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getEvolutionCatalogSyncQueue, getEvolutionVisionQueue } from '@/lib/queues/jobs'
import { isEvolutionVisionEnabled } from '@/lib/evolution-vision'

function canManage(role: string | undefined) { return role === 'ADMIN' || role === 'MANAGER' }

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can view operations health' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId(); if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const [catalogQueue, visionQueue, sources, recentMetrics, webhook] = await Promise.all([
    getEvolutionCatalogSyncQueue().getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
    getEvolutionVisionQueue().getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
    prisma.evolutionCatalogSource.findMany({ where: { userId: ownerId, isActive: true }, select: { id: true, lastSyncAt: true, lastSuccessAt: true, updatedAt: true } }),
    prisma.evolutionWorkerMetric.findMany({ where: { OR: [{ userId: ownerId }, { userId: null }] }, orderBy: { createdAt: 'desc' }, take: 100, select: { queue: true, operation: true, status: true, durationMs: true, error: true, createdAt: true } }),
    prisma.evolutionWebhookHealth.findUnique({ where: { ownerUserId: ownerId }, select: { lastReceivedAt: true, lastErrorAt: true, lastError: true } }),
  ])
  const averageLatencyMs = recentMetrics.filter((metric) => metric.status === 'SUCCEEDED' && metric.durationMs != null).reduce((acc, metric, _index, array) => acc + (metric.durationMs || 0) / array.length, 0)
  const staleSources = sources.filter((source) => !source.lastSuccessAt || Date.now() - source.lastSuccessAt.getTime() > 26 * 60 * 60 * 1000).map((source) => source.id)
  return NextResponse.json({ data: { queues: { catalogSync: catalogQueue, vision: visionQueue }, catalog: { activeSources: sources.length, staleSourceIds: staleSources }, vision: { enabled: isEvolutionVisionEnabled(), model: process.env.EVOLUTION_VISION_MODEL || 'Xenova/clip-vit-base-patch16' }, webhook, averageWorkerLatencyMs: Math.round(averageLatencyMs), recentMetrics } })
}
