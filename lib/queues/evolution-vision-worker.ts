import type { Job } from 'bullmq'
import { indexEvolutionLotMedia, matchEvolutionGroupImage } from '@/lib/evolution-vision'
import { createEvolutionVisionWorker, type EvolutionVisionJobData } from './jobs'

let workerStarted = false

export function startEvolutionVisionWorker() {
  if (workerStarted) return
  workerStarted = true
  const worker = createEvolutionVisionWorker(async (job: Job<EvolutionVisionJobData>) => {
    if (job.data.lotMediaId) await indexEvolutionLotMedia({ ownerUserId: job.data.ownerUserId, lotMediaId: job.data.lotMediaId, jobId: String(job.id) })
    else if (job.data.groupId && job.data.requestedMessageId) await matchEvolutionGroupImage({ ownerUserId: job.data.ownerUserId, groupId: job.data.groupId, requestedMessageId: job.data.requestedMessageId, sourceUrl: job.data.sourceUrl, jobId: String(job.id) })
    else throw new Error('Vision job is missing a lot media or group-message target')
  })
  worker.on('failed', (job, error) => console.error(`[evolution-vision-worker] job ${job?.id ?? 'unknown'} failed:`, error.message))
  console.log('[evolution-vision-worker] started')
}
