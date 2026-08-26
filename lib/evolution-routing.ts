import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { evaluateRoutingRules } from '@/lib/routing/rule-engine'

export type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instanceName: string
  webhookSecret: string
}

export class EvolutionApiError extends Error {
  readonly status: number

  constructor(status: number, detail: string) {
    super(`Evolution API ${status}: ${detail}`)
    this.name = 'EvolutionApiError'
    this.status = status
  }
}

export type EvolutionInboundMessage = {
  groupJid: string
  messageId: string
  senderJid: string
  senderName: string | null
  text: string | null
  messageType: string
  mediaType: 'image' | 'document' | 'audio' | 'video' | null
  mediaMimeType: string | null
  mediaFileName: string | null
  mediaUrl: string | null
  rawMessage: Record<string, unknown>
  quotedMessageId: string | null
  mentionedJids: string[]
  fromMe: boolean
  createdAt: Date
  subject: string
  isReaction: boolean
  reactionTargetMessageId: string | null
  reactionEmoji: string | null
}

export type EvolutionMessageStatusUpdate = {
  messageId: string
  groupJid: string | null
  status: 'SENT' | 'DELIVERED' | 'READ'
  fromMe: boolean
  updatedAt: Date
}

export type DepartmentMatch = {
  departmentId: number | null
  departmentName: string | null
  routingReason: string | null
  routeType: 'DIRECT_MENTION' | 'KEYWORD' | 'AI_CLASSIFIED' | 'EXISTING' | 'DEFAULT'
  mentionPriority: boolean
  assignedUserId?: number | null
  confidence?: number | null
  intent?: IntentResult['department'] | null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME?.trim()
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim()
  if (!baseUrl || !apiKey || !instanceName || !webhookSecret) return null
  return { baseUrl, apiKey, instanceName, webhookSecret }
}

export function normalizeJid(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function normalizePhoneJid(value: string | null | undefined): string {
  return normalizeJid(value).replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '')
}

export function isGroupJid(value: string | null | undefined): boolean {
  return normalizeJid(value).endsWith('@g.us')
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isAuthorizedEvolutionWebhook(request: Request): boolean {
  const config = getEvolutionConfig()
  if (!config) return false
  const authorization = request.headers.get('authorization') || ''
  const bearer = authorization.replace(/^Bearer\s+/i, '').trim()
  const custom = request.headers.get('x-evolution-webhook-secret')?.trim() || ''
  return Boolean(
    (bearer && safeEqual(bearer, config.webhookSecret)) ||
    (custom && safeEqual(custom, config.webhookSecret)),
  )
}

export async function evolutionRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  const headers = new Headers(init.headers)
  headers.set('apikey', config.apiKey)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers, cache: 'no-store', signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Evolution API request timed out after ${timeoutMs / 1000}s (${path})`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const raw = await response.text()
  let parsed: unknown = null
  try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = raw }
  if (!response.ok) {
    const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    throw new EvolutionApiError(response.status, detail)
  }
  return parsed as T
}

function mediaInfo(message: Record<string, unknown>): {
  type: EvolutionInboundMessage['mediaType']
  mimeType: string | null
  fileName: string | null
} {
  const candidates: Array<[EvolutionInboundMessage['mediaType'], Record<string, unknown>]> = [
    ['image', objectValue(message.imageMessage)],
    ['document', objectValue(message.documentMessage)],
    ['audio', objectValue(message.audioMessage)],
    ['video', objectValue(message.videoMessage)],
  ]
  for (const [type, value] of candidates) {
    if (Object.keys(value).length > 0) {
      return {
        type,
        mimeType: firstString(value.mimetype, value.mimeType),
        fileName: firstString(value.fileName, value.filename, value.name),
      }
    }
  }
  return { type: null, mimeType: null, fileName: null }
}

function base64FromEvolutionResponse(value: unknown): Buffer | null {
  const root = objectValue(value)
  const nested = objectValue(root.data)
  const raw = firstString(root.base64, nested.base64, root.media, nested.media)
  if (!raw) return null
  const normalized = raw.replace(/^data:[^;,]+;base64,/i, '').replace(/\s/g, '')
  if (!normalized) return null
  const buffer = Buffer.from(normalized, 'base64')
  return buffer.length > 0 ? buffer : null
}

/**
 * Evolution webhook media URLs are encrypted WhatsApp CDN URLs, so they
 * cannot be rendered by a browser. Retrieve the decrypted base64 immediately
 * while Evolution still has the message key in its store.
 */
export async function downloadEvolutionMedia(rawMessage: Record<string, unknown>): Promise<Buffer | null> {
  const embedded = base64FromEvolutionResponse(rawMessage)
  if (embedded) return embedded
  const config = getEvolutionConfig()
  if (!config) return null
  try {
    const response = await evolutionRequest<unknown>(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instanceName)}`,
      { method: 'POST', body: JSON.stringify({ message: rawMessage, convertToMp4: false }) },
      30000,
    )
    return base64FromEvolutionResponse(response)
  } catch (error) {
    console.warn('[evolution/media] unable to download inbound media:', error)
    return null
  }
}

export async function getEvolutionConnectionState() {
  const config = getEvolutionConfig()
  if (!config) return { configured: false, state: 'not_configured' as const }
  const data = await evolutionRequest<unknown>(`/instance/connectionState/${encodeURIComponent(config.instanceName)}`)
  const object = objectValue(data)
  const nested = objectValue(object.instance)
  const state = firstString(object.state, nested.state, object.connectionState) || 'unknown'
  return { configured: true, state, instanceName: config.instanceName }
}

export async function getEvolutionQrCode() {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  const instance = encodeURIComponent(config.instanceName)
  try {
    return await evolutionRequest<unknown>(`/instance/connect/${instance}`, {}, 30000)
  } catch (error) {
    // A fresh deployment may have the Evolution API running but not yet have
    // its named instance. Create it once, then request the QR again.
    if (!(error instanceof EvolutionApiError) || ![400, 404].includes(error.status)) throw error
    await evolutionRequest<unknown>('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: config.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    }, 30000)
    return evolutionRequest<unknown>(`/instance/connect/${instance}`, {}, 30000)
  }
}

export async function getEvolutionGroupSubject(groupJid: string): Promise<string | null> {
  const config = getEvolutionConfig()
  if (!config) return null
  try {
    const response = await evolutionRequest<unknown>(`/group/findGroupInfos/${encodeURIComponent(config.instanceName)}?groupJid=${encodeURIComponent(groupJid)}`)
    const root = objectValue(response)
    return firstString(root.subject, root.name, objectValue(root.group).subject, objectValue(root.group).name)
  } catch {
    return null
  }
}

export async function configureEvolutionWebhook(webhookUrl: string) {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  return evolutionRequest<unknown>(`/webhook/set/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        base64: true,
        headers: { Authorization: `Bearer ${config.webhookSecret}` },
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE'],
      },
    }),
  })
}

function extractText(message: Record<string, unknown>, data: Record<string, unknown>): string | null {
  const extended = objectValue(message.extendedTextMessage)
  const image = objectValue(message.imageMessage)
  const video = objectValue(message.videoMessage)
  const document = objectValue(message.documentMessage)
  const text = firstString(
    message.conversation,
    extended.text,
    image.caption,
    video.caption,
    document.caption,
    data.text,
  )
  return text
}

/** Unwrap WhatsApp's ephemeral/view-once envelopes without altering the raw
 * WebMessageInfo retained for Evolution's media-download endpoint. */
function unwrapMessage(message: Record<string, unknown>): Record<string, unknown> {
  let current = message
  for (let index = 0; index < 4; index += 1) {
    const wrapper = objectValue(
      current.ephemeralMessage ||
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension ||
      current.documentWithCaptionMessage,
    )
    const nested = objectValue(wrapper.message)
    if (Object.keys(nested).length === 0) return current
    current = nested
  }
  return current
}

function extractMessageType(message: Record<string, unknown>, data: Record<string, unknown>): string {
  return firstString(data.messageType, data.type, Object.keys(message)[0], 'text') || 'text'
}

function extractMessageItems(body: unknown): Record<string, unknown>[] {
  const root = objectValue(body)
  const data = root.data
  if (Array.isArray(data)) return data.map(objectValue)
  return [objectValue(data)]
}

export function extractEvolutionMessages(body: unknown): EvolutionInboundMessage[] {
  const root = objectValue(body)
  const event = stringValue(root.event || root.type).toUpperCase().replace(/[.\-]/g, '_')
  // UPSERT is the normal inbound event. Some Evolution/Baileys versions emit
  // a reaction as a MESSAGES_UPDATE instead, so allow that event only when it
  // actually contains a reaction. All other status updates stay ignored.
  if (event && event !== 'MESSAGES_UPSERT' && event !== 'MESSAGES_UPDATE') return []

  const messages: EvolutionInboundMessage[] = []
  for (const data of extractMessageItems(body)) {
    const key = objectValue(data.key)
    const update = objectValue(data.update)
    const rawMessage = Object.keys(objectValue(data.message)).length > 0
      ? objectValue(data.message)
      : objectValue(update.message)
    const message = unwrapMessage(rawMessage)
    const contextInfo = objectValue(objectValue(message.extendedTextMessage).contextInfo)
    const reactionCandidates = [
      objectValue(message.reactionMessage),
      objectValue(update.reactionMessage),
      objectValue(data.reactionMessage),
      objectValue(data.reaction),
    ]
    const reaction = reactionCandidates.find((candidate) => Object.keys(candidate).length > 0) || {}
    const reactionKey = objectValue(reaction.key)
    const isReaction = Object.keys(reaction).length > 0 || String(data.messageType || data.type || Object.keys(message)[0] || '').toLowerCase().includes('reaction')
    if (event === 'MESSAGES_UPDATE' && !isReaction) continue
    const groupJid = firstString(key.remoteJid, data.remoteJid, data.chatId, data.jid)
    const rawMessageId = firstString(key.id, data.messageId, data.id)
    const reactionTargetMessageId = firstString(
      reactionKey.id,
      data.reactionMessageId,
      objectValue(data.reaction).messageId,
      objectValue(data.reactionMessage).messageId,
      update.reactionMessageId,
    )
    const messageId = event === 'MESSAGES_UPDATE' && reactionTargetMessageId && rawMessageId === reactionTargetMessageId
      ? `reaction:${reactionTargetMessageId}:${firstString(key.participant, data.participant, data.sender, 'unknown')}:${firstString(reaction.text, data.reactionText, 'removed')}`
      : rawMessageId
    if (!groupJid || !isGroupJid(groupJid) || !messageId) continue

    const fromMe = key.fromMe === true || data.fromMe === true
    const senderJid = firstString(key.participant, data.participant, data.sender, fromMe ? key.remoteJid : null, 'unknown') || 'unknown'
    const timestamp = Number(data.messageTimestamp || data.timestamp || Date.now() / 1000)
    const createdAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000)
    const mentioned = [
      ...(Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : []),
      ...(Array.isArray(data.mentionedJid) ? data.mentionedJid : []),
    ].filter((value): value is string => typeof value === 'string')
    const info = mediaInfo(message)
    const media = objectValue(message.imageMessage).url || objectValue(message.videoMessage).url || objectValue(message.documentMessage).url || objectValue(message.audioMessage).url

    messages.push({
      groupJid: normalizeJid(groupJid),
      messageId,
      senderJid: normalizeJid(senderJid),
      senderName: firstString(data.pushName, data.senderName, data.participantName),
      text: isReaction ? null : extractText(message, data),
      messageType: extractMessageType(message, data),
      mediaType: info.type,
      mediaMimeType: info.mimeType,
      mediaFileName: info.fileName,
      mediaUrl: typeof media === 'string' ? media : null,
      rawMessage: { ...data, messageType: extractMessageType(message, data) },
      quotedMessageId: firstString(contextInfo.stanzaId, data.quotedMessageId),
      mentionedJids: mentioned.map(normalizeJid),
      fromMe,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      subject: firstString(data.subject, data.groupName, data.chatName, root.subject, groupJid) || groupJid,
      isReaction,
      reactionTargetMessageId,
      reactionEmoji: firstString(reaction.text, data.reactionText),
    })
  }
  return messages
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsPhrase(text: string, phrase: string): boolean {
  const clean = phrase.trim().toLowerCase()
  if (!clean) return false
  return new RegExp(`(^|\\s|[@#])${escapeRegExp(clean)}(?=$|\\s|[.!?,:;)])`, 'i').test(text)
}

export type IntentResult = {
  department: 'sales' | 'accounts' | 'logistics' | 'unclear'
  confidence: number
  reason: string
}

const INTENT_PROMPT = `Classify a B2B WhatsApp group message into exactly one department.\nSales: inquiries, rates, samples, product questions, new orders.\nAccounts: invoices, GST, payment, refunds, billing, ledger.\nLogistics: bilty, LR, transport, tracking, dispatch status, delivery.\nIf genuinely ambiguous, return unclear. Output only JSON with department, confidence from 0 to 1, and a short reason.`

function validIntent(value: unknown): IntentResult | null {
  const object = objectValue(value)
  const department = stringValue(object.department).toLowerCase()
  if (!['sales', 'accounts', 'logistics', 'unclear'].includes(department)) return null
  const confidence = Math.max(0, Math.min(1, Number(object.confidence)))
  return { department: department as IntentResult['department'], confidence: Number.isFinite(confidence) ? confidence : 0, reason: firstString(object.reason) || 'No reason returned' }
}

async function jsonPost(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`classifier HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => stringValue(objectValue(item).text)).filter(Boolean).join('\n')
  return ''
}

async function classifyWithGroq(text: string): Promise<IntentResult | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const response = await jsonPost(process.env.GROQ_ROUTING_URL || 'https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }, { model: process.env.GROQ_ROUTING_MODEL || 'llama-3.1-8b-instant', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: INTENT_PROMPT }, { role: 'user', content: text }] })
    const root = objectValue(response)
    const choice = Array.isArray(root.choices) ? objectValue(root.choices[0]) : {}
    const message = objectValue(choice.message)
    return validIntent(JSON.parse(contentText(message.content)))
  } catch (error) {
    console.error('[evolution/router] Groq classification failed:', error)
    return null
  }
}

async function classifyWithClaude(text: string): Promise<IntentResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const response = await jsonPost(process.env.ANTHROPIC_ROUTING_URL || 'https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, { model: process.env.ANTHROPIC_ROUTING_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 160, system: INTENT_PROMPT, messages: [{ role: 'user', content: text }] })
    const root = objectValue(response)
    const content = Array.isArray(root.content) ? root.content.map((item) => stringValue(objectValue(item).text)).join('\n') : ''
    return validIntent(JSON.parse(content))
  } catch (error) {
    console.error('[evolution/router] Claude classification failed:', error)
    return null
  }
}

export async function classifyIntent(text: string): Promise<IntentResult> {
  const groq = await classifyWithGroq(text)
  if (groq && groq.department !== 'unclear' && groq.confidence >= 0.7) return groq
  const claude = await classifyWithClaude(text)
  if (claude) return claude
  return groq || { department: 'unclear', confidence: 0, reason: 'LLM unavailable or uncertain' }
}

export async function resolveDepartmentForMessage(input: {
  groupJid: string
  subject: string
  text: string | null
  mentionedJids: string[]
  existingDepartmentIds?: number[]
}): Promise<DepartmentMatch[]> {
  const departments = await prisma.routingDepartment.findMany({
    where: { isActive: true },
    include: { users: { where: { isActive: true, staff: { status: 'Active' } }, select: { id: true, name: true, routingPhone: true, routingAliases: true, staff: { select: { name: true } } } } },
    orderBy: { id: 'asc' },
  })
  const haystack = `${input.subject} ${input.text || ''}`.toLowerCase()
  const mentionedJids = new Set(input.mentionedJids.map(normalizePhoneJid))
  const businessAliases = (process.env.EVOLUTION_BUSINESS_ALIASES || '').split(',').map((value) => value.trim()).filter(Boolean)
  const businessMention = businessAliases.some((alias) => containsPhrase(haystack, alias))

  const matches: DepartmentMatch[] = []
  const seenDepartments = new Set<number>()

  function addMatch(match: DepartmentMatch) {
    if (match.departmentId !== null && !seenDepartments.has(match.departmentId)) {
      matches.push(match)
      seenDepartments.add(match.departmentId)
    } else if (match.departmentId === null && matches.length === 0) {
      matches.push(match)
    }
  }

  // Explicit @tag or a person/profile alias always wins over keywords and AI.
  for (const department of departments) {
    for (const user of department.users) {
      const aliases = [user.name, user.staff?.name, ...(user.routingAliases || [])].filter((value): value is string => Boolean(value))
      const directMention = Boolean(user.routingPhone && mentionedJids.has(normalizePhoneJid(user.routingPhone))) || aliases.some((alias) => containsPhrase(haystack, alias))
      if (directMention) addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'direct-person-mention', routeType: 'DIRECT_MENTION', mentionPriority: true, assignedUserId: user.id, confidence: 1, intent: null })
    }
  }
  if (matches.length > 0) return matches

  // Check custom routing rules
  const ruleContext = {
    text: input.text || '',
    subject: input.subject,
    senderJid: input.mentionedJids.length > 0 ? input.mentionedJids[0] : ''
  };

  const ruleMatch = await evaluateRoutingRules(ruleContext);
  if (ruleMatch) {
    const dName = departments.find(d => d.id === ruleMatch.departmentId)?.name || 'Custom Rule routing'
    addMatch({ departmentId: ruleMatch.departmentId, departmentName: dName, routingReason: `rule-${ruleMatch.id}`, routeType: 'KEYWORD', mentionPriority: businessMention, confidence: 1, intent: null });
  }
  if (matches.length > 0) return matches

  // Human-readable department names and configured aliases are deterministic.
  for (const department of departments) {
    const aliases = department.users.flatMap((user) => user.routingAliases || [])
    if (containsPhrase(haystack, department.name) || aliases.some((alias) => containsPhrase(haystack, alias))) {
      addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'department-keyword', routeType: 'KEYWORD', mentionPriority: businessMention || aliases.some((alias) => containsPhrase(haystack, alias)), confidence: 1, intent: null })
    }
  }
  if (matches.length > 0) return matches

  // Only ambiguous/no-keyword messages reach the LLM. A confident result can hand off
  // an existing thread; an unclear result preserves its current department.
  const intent = await classifyIntent(input.text || input.subject)
  if (intent.department !== 'unclear' && intent.confidence >= 0.7) {
    const department = departments.find((candidate) => candidate.name.toLowerCase() === intent.department)
    if (department) addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'ai-classified', routeType: 'AI_CLASSIFIED', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
  }
  if (matches.length > 0) return matches

  if (input.existingDepartmentIds && input.existingDepartmentIds.length > 0) {
    for (const dId of input.existingDepartmentIds) {
      const existing = departments.find((department) => department.id === dId)
      if (existing) addMatch({ departmentId: existing.id, departmentName: existing.name, routingReason: 'existing-group-mapping', routeType: 'EXISTING', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
    }
  }
  if (matches.length > 0) return matches

  const fallback = departments.find((department) => department.name.toLowerCase() === 'sales') || departments[0]
  if (fallback) addMatch({ departmentId: fallback.id, departmentName: fallback.name, routingReason: 'default-sales-fallback', routeType: 'DEFAULT', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })

  if (matches.length === 0) {
    addMatch({ departmentId: null, departmentName: null, routingReason: 'no-active-department', routeType: 'DEFAULT', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
  }

  return matches
}

export async function getEvolutionOwnerUserId(): Promise<number | null> {
  const configured = Number(process.env.EVOLUTION_OWNER_USER_ID)
  if (Number.isInteger(configured) && configured > 0) return configured
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { id: 'asc' }, select: { id: true } })
  return owner?.id ?? null
}

export async function sendEvolutionGroupText(input: { groupJid: string; text: string; quoted?: { id: string; text: string | null } }) {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  const quoted = input.quoted?.id
    ? { key: { id: input.quoted.id, remoteJid: input.groupJid, fromMe: false }, message: { conversation: input.quoted.text || '' } }
    : undefined
  return evolutionRequest<unknown>(`/message/sendText/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    // Evolution API v2.3.7 validates `text` at the top level. Although newer
    // docs show `textMessage.text`, that shape is rejected by the pinned image
    // with: instance requires property "text".
    body: JSON.stringify({ number: input.groupJid, text: input.text, linkPreview: true, ...(quoted ? { quoted } : {}) }),
  })
}

/** Extract only delivery/read acknowledgements for messages sent by Evolution.
 * MESSAGES_UPDATE also contains many unrelated updates, which deliberately do
 * not enter the group-inquiry ingestion path. */
export function extractEvolutionMessageStatusUpdates(body: unknown): EvolutionMessageStatusUpdate[] {
  const root = objectValue(body)
  const event = stringValue(root.event || root.type).toUpperCase().replace(/[.\-]/g, '_')
  if (event !== 'MESSAGES_UPDATE') return []
  const updates: EvolutionMessageStatusUpdate[] = []
  for (const data of extractMessageItems(body)) {
    const key = objectValue(data.key)
    const update = objectValue(data.update)
    const rawStatus = firstString(update.status, data.status)?.toUpperCase().replace(/[.\-\s]/g, '_')
    const status = rawStatus === 'READ' || rawStatus === 'READ_ACK'
      ? 'READ'
      : rawStatus === 'DELIVERED' || rawStatus === 'DELIVERY_ACK'
        ? 'DELIVERED'
        : rawStatus === 'SENT' || rawStatus === 'SERVER_ACK'
          ? 'SENT'
          : null
    const messageId = firstString(key.id, data.messageId, data.id)
    if (!status || !messageId) continue
    const timestamp = Number(update.timestamp || data.messageTimestamp || data.timestamp || Date.now() / 1000)
    const updatedAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000)
    updates.push({
      messageId,
      groupJid: firstString(key.remoteJid, data.remoteJid, data.chatId, data.jid),
      status,
      fromMe: key.fromMe === true || data.fromMe === true,
      updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
    })
  }
  return updates
}

export async function sendEvolutionGroupMedia(input: {
  groupJid: string
  mediaUrl: string
  mediaType: 'image' | 'document' | 'audio' | 'video'
  mimeType: string
  fileName: string
  caption?: string
  quoted?: { id: string; text: string | null }
}) {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  const quoted = input.quoted?.id
    ? { key: { id: input.quoted.id, remoteJid: input.groupJid, fromMe: false }, message: { conversation: input.quoted.text || '' } }
    : undefined

  if (input.mediaType === 'audio') {
    return evolutionRequest<unknown>(`/message/sendWhatsAppAudio/${encodeURIComponent(config.instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({ number: input.groupJid, audio: input.mediaUrl, mimetype: input.mimeType, ...(quoted ? { quoted } : {}) }),
    }, 30000)
  }

  return evolutionRequest<unknown>(`/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    // v2.3.7 accepts filename for images but fileName for documents. Sending
    // both keeps the request compatible with that API version.
    body: JSON.stringify({ number: input.groupJid, mediatype: input.mediaType, media: input.mediaUrl, mimetype: input.mimeType, fileName: input.fileName, filename: input.fileName, ...(input.caption ? { caption: input.caption } : {}), ...(quoted ? { quoted } : {}) }),
  }, 30000)
}
