import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export async function recordEvolutionWorkerMetric(input: {
  userId?: number | null
  queue: string
  jobId?: string | null
  operation: string
  status: 'SUCCEEDED' | 'FAILED' | 'QUEUED'
  durationMs?: number | null
  error?: string | null
  metadata?: Record<string, unknown>
}) {
  // Telemetry must never make the business operation fail.
  await prisma.evolutionWorkerMetric.create({
    data: { ...input, userId: input.userId ?? null, jobId: input.jobId ?? null, durationMs: input.durationMs ?? null, error: input.error?.slice(0, 2_000) ?? null, metadata: input.metadata as Prisma.InputJsonValue | undefined },
  }).catch(() => undefined)
}
