import type { Job } from 'bullmq'
import { prisma } from '@/lib/db'
import { EvolutionApiError, sendEvolutionGroupText } from '@/lib/evolution-routing'
import { EvolutionSafetyBlockedError, getOrCreateEvolutionSafetyConfig } from '@/lib/evolution-safety'
import { createEvolutionCampaignWorker, getEvolutionCampaignQueue, type EvolutionCampaignJobData } from './jobs'

let workerStarted = false

function providerMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
  const nestedKey = data.key && typeof data.key === 'object' ? data.key as Record<string, unknown> : {}
  return typeof key.id === 'string' && key.id ? key.id : typeof nestedKey.id === 'string' && nestedKey.id ? nestedKey.id : null
}

async function refreshCampaignStatus(campaignId: string) {
  const recipients = await prisma.evolutionCampaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: { _all: true } })
  const counts = new Map(recipients.map((row) => [row.status, row._count._all]))
  const pending = (counts.get('PENDING') || 0) + (counts.get('PROCESSING') || 0)
  const sent = (counts.get('SENT') || 0) + (counts.get('DELIVERED') || 0) + (counts.get('READ') || 0) + (counts.get('REPLIED') || 0)
  const total = recipients.reduce((sum, row) => sum + row._count._all, 0)
  const blocked = counts.get('BLOCKED') || 0
  const unknown = counts.get('UNKNOWN') || 0
  const status = pending > 0 ? 'SENDING' : unknown > 0 ? 'REVIEW_REQUIRED' : sent === total ? 'SENT' : sent > 0 ? 'PARTIAL' : blocked > 0 ? 'PAUSED' : 'FAILED'
  await prisma.evolutionCampaign.update({ where: { id: campaignId }, data: { status } })
}

async function processRecipient(job: EvolutionCampaignJobData) {
  const claimed = await prisma.evolutionCampaignRecipient.updateMany({ where: { id: job.recipientId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'PROCESSING' } })
  if (!claimed.count) return
  const recipient = await prisma.evolutionCampaignRecipient.findUnique({ where: { id: job.recipientId }, include: { campaign: true } })
  if (!recipient) return

  const identity = await prisma.dealerEvolutionIdentity.findUnique({ where: { userId_groupJid: { userId: recipient.campaign.userId, groupJid: recipient.groupJid } } })
  if (!identity || identity.marketingConsentStatus !== 'OPTED_IN' || !identity.marketingOptInAt) {
    await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'BLOCKED' } })
    await refreshCampaignStatus(recipient.campaignId)
    return
  }
  const safety = await getOrCreateEvolutionSafetyConfig(recipient.campaign.userId)
  if (identity.lastCampaignAt && identity.lastCampaignAt.getTime() > Date.now() - safety.campaignCooldownHours * 60 * 60 * 1000) {
    await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'BLOCKED' } })
    await refreshCampaignStatus(recipient.campaignId)
    return
  }

  try {
    const response = await sendEvolutionGroupText({
      groupJid: recipient.groupJid,
      text: recipient.campaign.message,
      ownerUserId: recipient.campaign.userId,
      category: 'CAMPAIGN',
      idempotencyKey: `evolution-campaign:${recipient.id}`,
      metadata: { campaignId: recipient.campaignId, recipientId: recipient.id, dealerId: recipient.dealerId },
    })
    const sentAt = new Date()
    await prisma.$transaction([
      prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'SENT', sentAt, providerMessageId: providerMessageId(response) } }),
      prisma.dealerEvolutionIdentity.update({ where: { id: identity.id }, data: { lastCampaignAt: sentAt } }),
    ])
  } catch (error) {
    if (error instanceof EvolutionSafetyBlockedError) {
      const retryAt = Date.now() + 15 * 60 * 1000
      await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: 'PENDING' } })
      await prisma.evolutionCampaign.update({ where: { id: recipient.campaignId }, data: { status: 'PAUSED' } })
      await getEvolutionCampaignQueue().add('send-dealer-campaign', { recipientId: recipient.id }, { jobId: `evolution-campaign:safety:${recipient.id}:${retryAt}`, delay: 15 * 60 * 1000 })
      return
    }
    // A structured Evolution HTTP rejection is definite. Network/telemetry
    // failures are ambiguous and must hold the recipient for human review so
    // a fresh campaign cannot accidentally duplicate an accepted message.
    await prisma.evolutionCampaignRecipient.update({ where: { id: recipient.id }, data: { status: error instanceof EvolutionApiError ? 'FAILED' : 'UNKNOWN' } })
  }
  await refreshCampaignStatus(recipient.campaignId)
}

export function startEvolutionCampaignWorker() {
  if (workerStarted) return
  workerStarted = true
  const worker = createEvolutionCampaignWorker(async (job: Job<EvolutionCampaignJobData>) => processRecipient(job.data))
  worker.on('failed', (job, error) => console.error(`[evolution-campaign-worker] job ${job?.id ?? 'unknown'} failed:`, error.message))
  void prisma.evolutionCampaignRecipient.findMany({ where: { status: { in: ['PENDING', 'PROCESSING'] }, campaign: { status: { in: ['QUEUED', 'SENDING', 'PAUSED'] } } }, select: { id: true } }).then(async (recipients) => {
    const recoveryRun = Date.now()
    await Promise.all(recipients.map((recipient) => getEvolutionCampaignQueue().add('send-dealer-campaign', { recipientId: recipient.id }, { jobId: `evolution-campaign-recovery:${recipient.id}:${recoveryRun}` })))
  }).catch((error) => console.error('[evolution-campaign-worker] unable to recover pending recipients:', error instanceof Error ? error.message : error))
  console.log('[evolution-campaign-worker] started')
}
