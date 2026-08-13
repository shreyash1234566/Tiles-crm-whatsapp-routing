/**
 * instrumentation.ts
 *
 * Next.js instrumentation hook — runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use it to boot the BullMQ automation worker so it's registered before
 * the first request arrives. The `register` function is called once per
 * server process (not once per request), making it the correct place to
 * start long-lived background workers.
 */

export async function register() {
  // Only start the worker in the Node.js runtime, not in the edge runtime
  // (which doesn't support ioredis / worker_threads).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.ENABLE_BACKGROUND_WORKERS === 'false') {
      console.warn('[queues] background workers disabled by ENABLE_BACKGROUND_WORKERS=false')
      return
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const { default: Redis } = await import('ioredis')
    const probe = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
    probe.on('error', () => {})

    try {
      await probe.connect()
      const serverInfo = await probe.info('server')
      const version = serverInfo.match(/redis_version:([^\r\n]+)/)?.[1]?.trim() || 'unknown'
      const majorVersion = Number.parseInt(version.split('.')[0], 10)
      if (!Number.isFinite(majorVersion) || majorVersion < 5) {
        console.warn(`[queues] BullMQ workers disabled: Redis ${version} detected, but Redis 5+ is required. Upgrade Redis or set ENABLE_BACKGROUND_WORKERS=false.`)
        probe.disconnect()
        return
      }
    } catch (error) {
      console.warn(`[queues] BullMQ workers disabled: Redis is unavailable at ${redisUrl}. Start Redis 5+ or set ENABLE_BACKGROUND_WORKERS=false.`, error instanceof Error ? error.message : '')
      probe.disconnect()
      return
    }
    probe.disconnect()

    const { startAutomationWorker } = await import('./lib/queues/automation-worker')
    startAutomationWorker()

    const { startAiAgentWorker } = await import('./lib/queues/ai-agent-worker')
    startAiAgentWorker()
  }
}
