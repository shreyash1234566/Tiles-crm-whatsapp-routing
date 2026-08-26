import type { Job } from 'bullmq'
import { processEvolutionAgentJob } from '@/lib/evolution-agent'
import { createEvolutionAgentWorker, type EvolutionAgentJobData } from './jobs'

let workerStarted = false

export function startEvolutionAgentWorker() {
  if (workerStarted) return
  workerStarted = true

  const worker = createEvolutionAgentWorker(async (job: Job<EvolutionAgentJobData>) => {
    await processEvolutionAgentJob(job.data)
  })

  worker.on('failed', (job, error) => {
    console.error(`[evolution-agent-worker] job ${job?.id ?? 'unknown'} failed:`, error.message)
  })
  console.log('[evolution-agent-worker] started')
}
