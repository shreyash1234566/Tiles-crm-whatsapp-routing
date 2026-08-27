/**
 * lib/queues/jobs.ts
 *
 * BullMQ queue and worker definitions for durable, retryable workflows.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Queue              │ Job               │ Retries │ Backoff         │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  automation-queue   │ run automation    │ 3       │ Exponential 5 s │
 * │  broadcast-status   │ sync counts       │ 5       │ Exponential 2 s │
 * │  message-delivery   │ retry failed send │ 3       │ Fixed 10 s      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Workers are imported separately so they only run in the right process
 * (Node.js server — not the edge runtime or the browser).
 */

import { Queue, Worker, type Job } from 'bullmq'
import type { RedisOptions } from 'ioredis'

// BullMQ manages its own internal Redis connections using these options.
// We do NOT share the main redis singleton here — BullMQ needs to control
// its own connection lifecycle (blocking commands, health checks, etc.).
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function parseRedisUrl(url: string): RedisOptions {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 200, 30_000),
    }
  } catch {
    // Fallback to localhost if URL parsing fails
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 200, 30_000),
    }
  }
}

const connection: RedisOptions = parseRedisUrl(REDIS_URL)

// ── Queue names ────────────────────────────────────────────────────────────
export const QUEUE_AUTOMATION = 'automation-queue'
export const QUEUE_BROADCAST_STATUS = 'broadcast-status-queue'
export const QUEUE_MESSAGE_DELIVERY = 'message-delivery-queue'
export const QUEUE_AI_AGENT = 'wa-ai-agent'
export const QUEUE_EVOLUTION_AGENT = 'evolution-agent'
export const QUEUE_EVOLUTION_FOLLOW_UP = 'evolution-follow-up'
export const QUEUE_EVOLUTION_CATALOG_SYNC = 'evolution-catalog-sync'
export const QUEUE_EVOLUTION_VISION = 'evolution-vision'
export const QUEUE_EVOLUTION_CAMPAIGN = 'evolution-campaign'

// ── Typed job data shapes ──────────────────────────────────────────────────

export interface AutomationJobData {
  userId: string
  triggerType:
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  contactId: string
  context: {
    message_text?: string
    conversation_id?: string
  }
}

export interface BroadcastStatusJobData {
  broadcastId: string
  recipientId: string
  status: string
  timestamp: number
}

export interface MessageDeliveryJobData {
  conversationId: string
  userId: string
  messageId: string      // internal DB id
  metaMessageId?: string // Meta's wa_id for status lookups
}

export interface AiAgentJobData {
  userId: string
  conversationId: string
  contactId: string
  contactPhone: string        // E.164 for WhatsApp; PSID/IGSID for social
  messageText: string
  incomingMessageId: string
  // Social channel fields (optional — only present for Facebook/Instagram jobs)
  channel?: 'whatsapp' | 'facebook' | 'instagram'
  socialPageAccessToken?: string  // encrypted Page Access Token for Messenger API
  socialRecipientId?: string      // PSID or IGSID to reply to
}

export interface EvolutionAgentJobData {
  ownerUserId: number
  groupId: string
  inboundMessageId: string
}

export interface EvolutionFollowUpJobData {
  followUpId: string
}

export interface EvolutionCatalogSyncJobData {
  sourceId: string
  ownerUserId: number
  trigger: 'SCHEDULED' | 'MANUAL'
}

export interface EvolutionVisionJobData {
  ownerUserId: number
  sourceUrl: string
  catalogItemId?: string
  lotMediaId?: string
  groupId?: string
  requestedMessageId?: string
}

export interface EvolutionCampaignJobData {
  recipientId: string
}

// ── Queue instances (Lazy Loaded) ──────────────────────────────────────────
let _automationQueue: Queue<AutomationJobData> | undefined
export function getAutomationQueue() {
  if (!_automationQueue) {
    _automationQueue = new Queue<AutomationJobData>(QUEUE_AUTOMATION, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return _automationQueue
}

let _broadcastStatusQueue: Queue<BroadcastStatusJobData> | undefined
export function getBroadcastStatusQueue() {
  if (!_broadcastStatusQueue) {
    _broadcastStatusQueue = new Queue<BroadcastStatusJobData>(
      QUEUE_BROADCAST_STATUS,
      {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      },
    )
  }
  return _broadcastStatusQueue
}

let _messageDeliveryQueue: Queue<MessageDeliveryJobData> | undefined
export function getMessageDeliveryQueue() {
  if (!_messageDeliveryQueue) {
    _messageDeliveryQueue = new Queue<MessageDeliveryJobData>(
      QUEUE_MESSAGE_DELIVERY,
      {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'fixed', delay: 10_000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      },
    )
  }
  return _messageDeliveryQueue
}

let _aiAgentQueue: Queue<AiAgentJobData> | undefined
export function getAiAgentQueue() {
  if (!_aiAgentQueue) {
    _aiAgentQueue = new Queue<AiAgentJobData>(QUEUE_AI_AGENT, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return _aiAgentQueue
}

let _evolutionAgentQueue: Queue<EvolutionAgentJobData> | undefined
export function getEvolutionAgentQueue() {
  if (!_evolutionAgentQueue) {
    _evolutionAgentQueue = new Queue<EvolutionAgentJobData>(QUEUE_EVOLUTION_AGENT, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return _evolutionAgentQueue
}

let _evolutionFollowUpQueue: Queue<EvolutionFollowUpJobData> | undefined
export function getEvolutionFollowUpQueue() {
  if (!_evolutionFollowUpQueue) {
    _evolutionFollowUpQueue = new Queue<EvolutionFollowUpJobData>(QUEUE_EVOLUTION_FOLLOW_UP, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    })
  }
  return _evolutionFollowUpQueue
}

let _evolutionCatalogSyncQueue: Queue<EvolutionCatalogSyncJobData> | undefined
export function getEvolutionCatalogSyncQueue() {
  if (!_evolutionCatalogSyncQueue) {
    _evolutionCatalogSyncQueue = new Queue<EvolutionCatalogSyncJobData>(QUEUE_EVOLUTION_CATALOG_SYNC, {
      connection,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: { count: 500 }, removeOnFail: { count: 500 } },
    })
  }
  return _evolutionCatalogSyncQueue
}

let _evolutionVisionQueue: Queue<EvolutionVisionJobData> | undefined
export function getEvolutionVisionQueue() {
  if (!_evolutionVisionQueue) {
    _evolutionVisionQueue = new Queue<EvolutionVisionJobData>(QUEUE_EVOLUTION_VISION, {
      connection,
      // Local CPU inference is intentionally serialized to protect the CRM.
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: { count: 300 }, removeOnFail: { count: 300 } },
    })
  }
  return _evolutionVisionQueue
}

let _evolutionCampaignQueue: Queue<EvolutionCampaignJobData> | undefined
export function getEvolutionCampaignQueue() {
  if (!_evolutionCampaignQueue) {
    _evolutionCampaignQueue = new Queue<EvolutionCampaignJobData>(QUEUE_EVOLUTION_CAMPAIGN, {
      connection,
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 1_000 } },
    })
  }
  return _evolutionCampaignQueue
}

// ── Worker factory ─────────────────────────────────────────────────────────
// Workers are created lazily so importing this module in the Next.js
// process (which runs in both server and edge contexts) doesn't accidentally
// spawn worker threads in the wrong environment.

type WorkerHandler<T> = (job: Job<T>) => Promise<void>

export function createAutomationWorker(handler: WorkerHandler<AutomationJobData>): Worker {
  return new Worker<AutomationJobData>(QUEUE_AUTOMATION, handler, {
    connection,
    concurrency: 5,
  })
}

export function createBroadcastStatusWorker(
  handler: WorkerHandler<BroadcastStatusJobData>,
): Worker {
  return new Worker<BroadcastStatusJobData>(QUEUE_BROADCAST_STATUS, handler, {
    connection,
    concurrency: 10,
  })
}

export function createMessageDeliveryWorker(
  handler: WorkerHandler<MessageDeliveryJobData>,
): Worker {
  return new Worker<MessageDeliveryJobData>(QUEUE_MESSAGE_DELIVERY, handler, {
    connection,
    concurrency: 5,
  })
}

export function createAiAgentWorker(
  handler: WorkerHandler<AiAgentJobData>,
): Worker {
  // concurrency = 2 caps concurrent Gemini API calls (prevents rate limits)
  return new Worker<AiAgentJobData>(QUEUE_AI_AGENT, handler, {
    connection,
    concurrency: 2,
  })
}

export function createEvolutionAgentWorker(
  handler: WorkerHandler<EvolutionAgentJobData>,
): Worker {
  // Serialise Evolution agent jobs so the per-ticket auto-reply cap is
  // deterministic and a human claim can win before the next job sends.
  return new Worker<EvolutionAgentJobData>(QUEUE_EVOLUTION_AGENT, handler, {
    connection,
    concurrency: 1,
  })
}

export function createEvolutionFollowUpWorker(
  handler: WorkerHandler<EvolutionFollowUpJobData>,
): Worker {
  return new Worker<EvolutionFollowUpJobData>(QUEUE_EVOLUTION_FOLLOW_UP, handler, {
    connection,
    concurrency: 2,
  })
}

export function createEvolutionCatalogSyncWorker(handler: WorkerHandler<EvolutionCatalogSyncJobData>): Worker {
  return new Worker<EvolutionCatalogSyncJobData>(QUEUE_EVOLUTION_CATALOG_SYNC, handler, { connection, concurrency: 1 })
}

export function createEvolutionVisionWorker(handler: WorkerHandler<EvolutionVisionJobData>): Worker {
  return new Worker<EvolutionVisionJobData>(QUEUE_EVOLUTION_VISION, handler, { connection, concurrency: 1 })
}

export function createEvolutionCampaignWorker(handler: WorkerHandler<EvolutionCampaignJobData>): Worker {
  // Campaign delivery is deliberately serial. The central safety adapter adds
  // the configured inter-message interval and circuit-breaker checks.
  return new Worker<EvolutionCampaignJobData>(QUEUE_EVOLUTION_CAMPAIGN, handler, { connection, concurrency: 1 })
}
