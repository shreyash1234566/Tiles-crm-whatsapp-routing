import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/redis'
import { embedText } from '@/lib/ai-agent/embedder'
import { retrieveChunks } from '@/lib/ai-agent/retriever'
import { generateResponse } from '@/lib/ai-agent/responder'
import { getGroqModelName } from '@/lib/ai-agent/groq'
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-agent/system-prompt'
import { sendEvolutionGroupText } from '@/lib/evolution-routing'
import {
  agentAllowsGroup,
  automaticEvolutionRepliesEnabled,
  isClosedInquiryStage,
  newIdempotencyKey,
} from '@/lib/evolution-operations'
import { isEvolutionQuietHour, maxEvolutionAutoRepliesPerTicket } from '@/lib/evolution-runtime-guards'

export interface EvolutionAgentJobPayload {
  ownerUserId: number
  groupId: string
  inboundMessageId: string
}

function compactHistory(messages: Array<{ fromMe: boolean; senderName: string | null; text: string | null }>): string {
  return messages
    .filter((message) => message.text?.trim())
    .slice(-12)
    .map((message) => `${message.fromMe ? 'Team' : (message.senderName || 'Dealer')}: ${message.text}`)
    .join('\n')
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
}

function languageInstruction(languages: string[]): string {
  const names = [...new Set(languages.map((language) => LANGUAGE_NAMES[language]).filter(Boolean))]
  return names.length > 0
    ? `Reply in the dealer's language. Supported response languages: ${names.join(', ')}.`
    : "Reply in the dealer's language; use English if the language is uncertain."
}

function providerMessageId(value: unknown): string {
  if (!value || typeof value !== 'object') return `crm-agent-${Date.now()}`
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : {}
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
  const directId = typeof key.id === 'string' ? key.id : ''
  const nestedKey = data.key && typeof data.key === 'object' ? data.key as Record<string, unknown> : {}
  const nestedId = typeof nestedKey.id === 'string' ? nestedKey.id : ''
  return directId || nestedId || `crm-agent-${Date.now()}`
}

async function recipientsForGroup(ownerUserId: number, departmentId: number | null | undefined): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { id: ownerUserId },
        ...(departmentId ? [{ routingDepartmentId: departmentId }] : []),
      ],
    },
    select: { id: true },
  })
  return users.map((user) => String(user.id))
}

async function recordAudit(input: {
  ticketId: string
  messageId: string
  inquiryId?: string | null
  event: string
  reason: string
  metadata?: Record<string, unknown>
}) {
  await prisma.evolutionRoutingAudit.create({
    data: {
      ticketId: input.ticketId,
      messageId: input.messageId,
      inquiryId: input.inquiryId || null,
      event: input.event,
      routeType: 'RAG',
      reason: input.reason,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  })
}

/**
 * Builds a grounded Evolution response. A run is persisted for every outcome;
 * by default the result is only a draft. Automatic live replies require both
 * an explicit database configuration and the server-side autosend flag.
 */
export async function processEvolutionAgentJob(payload: EvolutionAgentJobPayload): Promise<void> {
  const idempotencyKey = newIdempotencyKey('evolution-agent', payload.inboundMessageId)
  const existingRun = await prisma.evolutionAgentRun.findUnique({ where: { idempotencyKey } })
  if (existingRun && existingRun.status !== 'QUEUED') return

  const group = await prisma.evolutionGroup.findFirst({
    where: { id: payload.groupId, userId: payload.ownerUserId },
    include: {
      ticket: true,
      inquiry: true,
      messages: {
        where: { createdAt: { lte: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, messageId: true, fromMe: true, senderName: true, text: true, createdAt: true },
      },
    },
  })
  if (!group?.ticket) return

  const inbound = group.messages.find((message) => message.id === payload.inboundMessageId)
  if (!inbound || inbound.fromMe || !inbound.text?.trim()) return

  const run = existingRun ?? await prisma.evolutionAgentRun.create({
    data: {
      ticketId: group.ticket.id,
      groupId: group.id,
      inboundMessageId: inbound.id,
      idempotencyKey,
      status: 'QUEUED',
      mode: 'DRAFT',
    },
  })

  const skip = async (reason: string) => {
    await prisma.evolutionAgentRun.update({ where: { id: run.id }, data: { status: 'SKIPPED', error: reason } })
    await recordAudit({ ticketId: group.ticket!.id, messageId: inbound.id, inquiryId: group.inquiry?.id, event: 'RAG_SKIPPED', reason })
  }

  const config = await prisma.evolutionAgentConfig.findUnique({ where: { userId: payload.ownerUserId } })
  if (!config?.enabled) return skip('Evolution RAG is disabled')
  if (!agentAllowsGroup(config, group.groupJid, group.departmentId)) return skip('Group or department is not allowlisted for Evolution RAG')
  if (group.claimedByUserId || isClosedInquiryStage(group.ticket.stage) || group.ticket.status !== 'open' || isClosedInquiryStage(group.inquiry?.stage)) {
    return skip('Ticket is claimed, closed, or no longer eligible for an automated response')
  }

  const legacyConfig = await prisma.waAgentConfig.findUnique({ where: { user_id: String(payload.ownerUserId) } })
  // Detailed prompt settings are stored in the original agent row for
  // backward compatibility. Evolution's own enabled/draft controls remain
  // authoritative, while an explicitly disabled legacy row is still honored
  // as a safety stop for existing deployments.
  if (legacyConfig && !legacyConfig.enabled) return skip('Knowledge/RAG configuration is disabled')
  const agentConfig = legacyConfig ?? {
    agent_name: 'Assistant',
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    fallback_message: 'Let me connect you with our team.',
    confidence_threshold: config.confidenceThreshold,
    max_response_tokens: config.maxResponseTokens,
    response_delay_ms: config.responseDelayMs,
    languages: ['en', 'hi'],
  }

  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedText(inbound.text)
  } catch (error) {
    return skip(`Embedding failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  const threshold = Math.max(0, Math.min(1, config.confidenceThreshold))
  const chunks = await retrieveChunks(String(payload.ownerUserId), queryEmbedding, 3, threshold)
  if (chunks.length === 0) {
    await prisma.evolutionAgentRun.update({ where: { id: run.id }, data: { status: 'HANDOFF', handoff: true, responseText: agentConfig.fallback_message, retrievalIds: [] } })
    await recordAudit({ ticketId: group.ticket.id, messageId: inbound.id, inquiryId: group.inquiry?.id, event: 'RAG_HANDOFF', reason: 'No knowledge chunk met the configured confidence threshold' })
    return
  }

  let response: Awaited<ReturnType<typeof generateResponse>>
  try {
    response = await generateResponse({
      agentName: agentConfig.agent_name,
      companyName: process.env.TILES_COMPANY_NAME?.trim() || 'Tiles, Granite & Marble CRM',
      companyContext: `You assist only B2B dealers in a shared WhatsApp group. Never reveal internal cost, margin, supplier data, or unconfirmed stock. Draft a reply only from the supplied knowledge. Escalate price, exact lot, payment, dispatch, complaint, and any uncertainty to a human using [HANDOFF_NEEDED]. ${languageInstruction(agentConfig.languages)}`,
      retrievedChunks: chunks.map((chunk) => chunk.content).join('\n\n---\n\n'),
      conversationHistory: compactHistory([...group.messages].reverse()),
      customerMessage: inbound.text,
      systemPrompt: agentConfig.system_prompt,
      maxTokens: Math.min(Math.max(config.maxResponseTokens, 32), 500),
    })
  } catch (error) {
    return skip(`Generation failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  const retrievalIds = chunks.map((chunk) => chunk.id)
  if (response.needsHandoff || !response.confidenceOk || !response.text.trim()) {
    await prisma.evolutionAgentRun.update({
      where: { id: run.id },
      data: { status: 'HANDOFF', handoff: true, retrievalIds, responseText: response.text?.trim() || agentConfig.fallback_message, model: getGroqModelName() },
    })
    await recordAudit({ ticketId: group.ticket.id, messageId: inbound.id, inquiryId: group.inquiry?.id, event: 'RAG_HANDOFF', reason: 'Model requested human handoff or returned low-confidence output', metadata: { retrievalIds } })
    return
  }

  const shouldSend = !config.draftOnly && automaticEvolutionRepliesEnabled()
  if (shouldSend && isEvolutionQuietHour()) {
    const citedDraft = `${response.text}\n\n[Knowledge refs: ${chunks.map((chunk) => chunk.id).join(', ')}]`
    await prisma.evolutionAgentRun.update({ where: { id: run.id }, data: { status: 'DRAFTED', mode: 'DRAFT', responseText: citedDraft, retrievalIds: chunks.map((chunk) => chunk.id), model: getGroqModelName() } })
    await recordAudit({ ticketId: group.ticket.id, messageId: inbound.id, inquiryId: group.inquiry?.id, event: 'RAG_DRAFT', reason: 'Automated send deferred by configured quiet hours', metadata: { retrievalIds: chunks.map((chunk) => chunk.id) } })
    return
  }
  if (!shouldSend) {
    const citedDraft = `${response.text}\n\n[Knowledge refs: ${retrievalIds.join(', ')}]`
    await prisma.evolutionAgentRun.update({
      where: { id: run.id },
      data: { status: 'DRAFTED', mode: 'DRAFT', responseText: citedDraft, retrievalIds, model: getGroqModelName() },
    })
    await recordAudit({ ticketId: group.ticket.id, messageId: inbound.id, inquiryId: group.inquiry?.id, event: 'RAG_DRAFT', reason: 'Draft prepared; live sending is disabled', metadata: { retrievalIds } })
    return
  }

  // Re-read immediately before sending. A human claim, transfer, closure, or
  // a newer team reply always wins over the queued agent job.
  const fresh = await prisma.evolutionGroup.findUnique({
    where: { id: group.id },
    include: {
      ticket: true,
      inquiry: true,
      messages: { where: { fromMe: true, createdAt: { gt: inbound.createdAt } }, take: 1, select: { id: true } },
    },
  })
  if (!fresh?.ticket || fresh.claimedByUserId || fresh.messages.length > 0 || fresh.ticket.status !== 'open' || isClosedInquiryStage(fresh.ticket.stage) || isClosedInquiryStage(fresh.inquiry?.stage)) {
    return skip('A human action, closure, or newer team reply superseded this agent job')
  }
  const freshTicket = fresh.ticket

  // A misconfigured test group must not result in a conversation loop. This
  // count is checked immediately before the provider call, not only at queue
  // creation, so concurrent jobs remain bounded.
  const sentCount = await prisma.evolutionAgentRun.count({
    where: { ticketId: freshTicket.id, status: 'SENT' },
  })
  if (sentCount >= maxEvolutionAutoRepliesPerTicket()) {
    return skip(`Automatic-reply limit reached for this ticket (${maxEvolutionAutoRepliesPerTicket()})`)
  }

  let providerResponse: unknown
  try {
    if (config.responseDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(config.responseDelayMs, 10_000)))
    providerResponse = await sendEvolutionGroupText({ groupJid: fresh.groupJid, text: response.text, quoted: { id: inbound.messageId, text: inbound.text } })
  } catch (error) {
    await prisma.evolutionAgentRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Evolution send failed', retrievalIds, responseText: response.text, model: getGroqModelName() } })
    await recordAudit({ ticketId: fresh.ticket.id, messageId: inbound.id, inquiryId: fresh.inquiry?.id, event: 'RAG_FAILED', reason: 'Evolution provider rejected the generated reply', metadata: { retrievalIds } })
    return
  }

  const sentAt = new Date()
  const outboundMessageId = providerMessageId(providerResponse)
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.evolutionGroupMessage.create({
      data: {
        groupId: fresh.id,
        messageId: outboundMessageId,
        senderJid: 'crm-agent',
        senderName: agentConfig.agent_name,
        text: response.text,
        messageType: 'conversation',
        fromMe: true,
        status: 'sent',
        quotedMessageId: inbound.messageId,
      },
    })
    await tx.evolutionGroup.update({ where: { id: fresh.id }, data: { lastMessageText: response.text, lastMessageAt: sentAt } })
    await tx.evolutionGroupTicket.update({
      where: { id: freshTicket.id },
      data: { firstResponseAt: freshTicket.firstResponseAt || sentAt, lastResponseAt: sentAt, version: { increment: 1 } },
    })
    if (fresh.inquiry) await tx.evolutionDealerInquiry.update({ where: { id: fresh.inquiry.id }, data: { lastActivityAt: sentAt } })
    await tx.evolutionAgentRun.update({ where: { id: run.id }, data: { status: 'SENT', mode: 'AUTOSEND', responseText: response.text, retrievalIds, providerMessageId: outboundMessageId, model: getGroqModelName() } })
    await tx.evolutionRoutingAudit.create({
      data: { ticketId: freshTicket.id, messageId: message.id, inquiryId: fresh.inquiry?.id || null, event: 'RAG_SENT', routeType: 'RAG', reason: 'Grounded Evolution RAG response sent', metadata: { retrievalIds, providerMessageId: outboundMessageId } },
    })
    return message
  })

  const recipients = await recipientsForGroup(payload.ownerUserId, fresh.departmentId)
  void publishEvent('chat_events', {
    type: 'new_message',
    userId: String(payload.ownerUserId),
    userIds: recipients,
    conversationId: fresh.id,
    payload: { message: result },
  })
}
