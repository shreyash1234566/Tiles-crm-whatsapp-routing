import type { Job } from 'bullmq'
import { prisma } from '@/lib/db'
import { sendEvolutionGroupText } from '@/lib/evolution-routing'
import { isClosedInquiryStage } from '@/lib/evolution-operations'
import { isEvolutionQuietHour, nextEvolutionQuietRetryAt } from '@/lib/evolution-runtime-guards'
import { createEvolutionFollowUpWorker, getEvolutionFollowUpQueue, type EvolutionFollowUpJobData } from './jobs'

let workerStarted = false

function providerMessageId(value: unknown): string {
  if (!value || typeof value !== 'object') return `follow-up-${Date.now()}`
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  if (typeof key.id === 'string' && key.id) return key.id
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
  const nestedKey = data.key && typeof data.key === 'object' ? data.key as Record<string, unknown> : {}
  return typeof nestedKey.id === 'string' && nestedKey.id ? nestedKey.id : `follow-up-${Date.now()}`
}

async function processFollowUp(job: EvolutionFollowUpJobData) {
  const claimed = await prisma.evolutionTicketFollowUp.updateMany({
    where: { id: job.followUpId, status: 'PENDING', scheduledFor: { lte: new Date() } },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
  })
  if (!claimed.count) return

  const followUp = await prisma.evolutionTicketFollowUp.findUnique({
    where: { id: job.followUpId },
    include: { ticket: { include: { group: true, inquiry: true } } },
  })
  if (!followUp) return
  const group = followUp.ticket.group
  const inquiry = followUp.ticket.inquiry
  if (group.status !== 'open' || followUp.ticket.status !== 'open' || isClosedInquiryStage(followUp.ticket.stage) || isClosedInquiryStage(inquiry?.stage)) {
    await prisma.evolutionTicketFollowUp.update({ where: { id: followUp.id }, data: { status: 'SKIPPED', error: 'Ticket or inquiry was closed before follow-up was due' } })
    return
  }
  if (isEvolutionQuietHour()) {
    // Keep the task durable and visibly pending. A new, uniquely identified
    // delayed job is enqueued before this worker completes; no reminder is
    // silently lost and no provider call occurs during quiet hours.
    const retryAt = nextEvolutionQuietRetryAt()
    await prisma.evolutionTicketFollowUp.update({ where: { id: followUp.id }, data: { status: 'PENDING', scheduledFor: retryAt, error: 'Deferred by configured quiet hours' } })
    await getEvolutionFollowUpQueue().add('send-group-follow-up', { followUpId: followUp.id }, { jobId: `evolution-follow-up:${followUp.id}:${retryAt.getTime()}`, delay: Math.max(1, retryAt.getTime() - Date.now()) })
    return
  }

  try {
    const response = await sendEvolutionGroupText({ groupJid: group.groupJid, text: followUp.message })
    const sentAt = new Date()
    const providerId = providerMessageId(response)
    await prisma.$transaction(async (tx) => {
      const message = await tx.evolutionGroupMessage.create({
        data: { groupId: group.id, messageId: providerId, senderJid: 'crm-follow-up', senderName: 'CRM follow-up', text: followUp.message, messageType: 'conversation', fromMe: true, status: 'sent' },
      })
      await tx.evolutionTicketFollowUp.update({ where: { id: followUp.id }, data: { status: 'SENT', sentAt, providerMessageId: providerId, error: null } })
      await tx.evolutionGroup.update({ where: { id: group.id }, data: { lastMessageText: followUp.message, lastMessageAt: sentAt } })
      await tx.evolutionGroupTicket.update({ where: { id: followUp.ticket.id }, data: { firstResponseAt: followUp.ticket.firstResponseAt || sentAt, lastResponseAt: sentAt, version: { increment: 1 } } })
      if (inquiry) {
        const next = await tx.evolutionTicketFollowUp.findFirst({ where: { inquiryId: inquiry.id, status: 'PENDING' }, orderBy: { scheduledFor: 'asc' }, select: { scheduledFor: true } })
        await tx.evolutionDealerInquiry.update({ where: { id: inquiry.id }, data: { lastActivityAt: sentAt, nextFollowUpAt: next?.scheduledFor || null } })
      }
      await tx.evolutionRoutingAudit.create({
        data: { ticketId: followUp.ticket.id, messageId: message.id, inquiryId: inquiry?.id || null, actorUserId: followUp.assignedUserId || null, event: 'FOLLOW_UP_SENT', routeType: 'AUTOMATION', reason: 'Scheduled Evolution group follow-up sent', metadata: { followUpId: followUp.id, providerMessageId: providerId } },
      })
    })
  } catch (error) {
    await prisma.evolutionTicketFollowUp.update({ where: { id: followUp.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 2000) : 'Evolution follow-up send failed' } })
    throw error
  }
}

export function startEvolutionFollowUpWorker() {
  if (workerStarted) return
  workerStarted = true
  const worker = createEvolutionFollowUpWorker(async (job: Job<EvolutionFollowUpJobData>) => {
    await processFollowUp(job.data)
  })
  worker.on('failed', (job, error) => console.error(`[evolution-follow-up-worker] job ${job?.id ?? 'unknown'} failed:`, error.message))
  console.log('[evolution-follow-up-worker] started')
}
