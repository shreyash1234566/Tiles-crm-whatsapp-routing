import type { Job } from 'bullmq'
import { syncEvolutionCatalogSource } from '@/lib/evolution-catalog-sync'
import { createEvolutionCatalogSyncWorker, type EvolutionCatalogSyncJobData } from './jobs'

let workerStarted = false

export function startEvolutionCatalogSyncWorker() {
  if (workerStarted) return
  workerStarted = true
  const worker = createEvolutionCatalogSyncWorker(async (job: Job<EvolutionCatalogSyncJobData>) => {
    await syncEvolutionCatalogSource(job.data.sourceId, { expectedOwnerId: job.data.ownerUserId, jobId: String(job.id), trigger: job.data.trigger })
  })
  worker.on('failed', (job, error) => console.error(`[evolution-catalog-sync-worker] job ${job?.id ?? 'unknown'} failed:`, error.message))
  console.log('[evolution-catalog-sync-worker] started')
}
