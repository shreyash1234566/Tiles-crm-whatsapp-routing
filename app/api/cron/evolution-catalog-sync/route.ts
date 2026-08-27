import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEvolutionCatalogSyncQueue } from '@/lib/queues/jobs'
import { recordEvolutionWorkerMetric } from '@/lib/evolution-worker-metrics'

function authorized(request: Request) {
  const secret = process.env.CRM_API_SECRET
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

// Call this from a host cron (for example hourly). Hour-bucketed job IDs make
// repeated scheduler attempts idempotent rather than starting parallel imports.
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sources = await prisma.evolutionCatalogSource.findMany({ where: { isActive: true }, select: { id: true, userId: true } })
  const bucket = new Date().toISOString().slice(0, 13)
  const queue = getEvolutionCatalogSyncQueue(); const jobIds: string[] = []
  for (const source of sources) {
    const job = await queue.add('scheduled-catalog-sync', { sourceId: source.id, ownerUserId: source.userId, trigger: 'SCHEDULED' }, { jobId: `catalog-sync:${source.id}:${bucket}` })
    jobIds.push(String(job.id))
    void recordEvolutionWorkerMetric({ userId: source.userId, queue: 'evolution-catalog-sync', jobId: String(job.id), operation: 'scheduled_catalog_sync', status: 'QUEUED', metadata: { sourceId: source.id } })
  }
  return NextResponse.json({ data: { queuedSources: sources.length, jobIds } })
}
