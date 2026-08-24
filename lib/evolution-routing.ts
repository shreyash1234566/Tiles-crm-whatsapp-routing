import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'

export type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instanceName: string
  webhookSecret: string
}

export type EvolutionInboundMessage = {
  groupJid: string
  messageId: string
  senderJid: string
  senderName: string | null
  text: string | null
  messageType: string
  mediaUrl: string | null
  quotedMessageId: string | null
  mentionedJids: string[]
  fromMe: boolean
  createdAt: Date
  subject: string
}

export type DepartmentMatch = {
  departmentId: number | null
  departmentName: string | null
  routingReason: string | null
  mentionPriority: boolean
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
  return (bearer && safeEqual(bearer, config.webhookSecret)) || (custom && safeEqual(custom, config.webhookSecret))
}

export async function evolutionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getEvolutionConfig()
  if (!config) throw new Error('Evolution API is not configured')
  const headers = new Headers(init.headers)
  headers.set('apikey', config.apiKey)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers, cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
  const raw = await response.text()
  let parsed: unknown = null
  try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = raw }
  if (!response.ok) {
    const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    throw new Error(`Evolution API ${response.status}: ${detail}`)
  }
  return parsed as T
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
  return evolutionRequest<unknown>(`/instance/connect/${encodeURIComponent(config.instanceName)}`)
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
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE'],
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
  if (event && !event.includes('MESSAGE') && event !== 'MESSAGES_UPSERT') return []

  const messages: EvolutionInboundMessage[] = []
  for (const data of extractMessageItems(body)) {
    const key = objectValue(data.key)
    const message = objectValue(data.message)
    const contextInfo = objectValue(objectValue(message.extendedTextMessage).contextInfo)
    const groupJid = firstString(key.remoteJid, data.remoteJid, data.chatId, data.jid)
    const messageId = firstString(key.id, data.messageId, data.id)
    if (!groupJid || !isGroupJid(groupJid) || !messageId) continue

    const fromMe = key.fromMe === true || data.fromMe === true
    const senderJid = firstString(key.participant, data.participant, data.sender, fromMe ? key.remoteJid : null, 'unknown') || 'unknown'
    const timestamp = Number(data.messageTimestamp || data.timestamp || Date.now() / 1000)
    const createdAt = new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000)
    const mentioned = [
      ...(Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : []),
      ...(Array.isArray(data.mentionedJid) ? data.mentionedJid : []),
    ].filter((value): value is string => typeof value === 'string')
    const media = objectValue(message.imageMessage).url || objectValue(message.videoMessage).url || objectValue(message.documentMessage).url

    messages.push({
      groupJid: normalizeJid(groupJid),
      messageId,
      senderJid: normalizeJid(senderJid),
      senderName: firstString(data.pushName, data.senderName, data.participantName),
      text: extractText(message, data),
      messageType: extractMessageType(message, data),
      mediaUrl: typeof media === 'string' ? media : null,
      quotedMessageId: firstString(contextInfo.stanzaId, data.quotedMessageId),
      mentionedJids: mentioned.map(normalizeJid),
      fromMe,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      subject: firstString(data.subject, data.groupName, data.chatName, root.subject, groupJid) || groupJid,
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

export async function resolveDepartmentForMessage(input: {
  groupJid: string
  subject: string
  text: string | null
  mentionedJids: string[]
  existingDepartmentId?: number | null
}): Promise<DepartmentMatch> {
  if (input.existingDepartmentId) {
    const existing = await prisma.routingDepartment.findUnique({ where: { id: input.existingDepartmentId }, select: { id: true, name: true, isActive: true } })
    if (existing?.isActive) {
      const aliases = (process.env.EVOLUTION_BUSINESS_ALIASES || '').split(',').map((value) => value.trim()).filter(Boolean)
      const haystack = `${input.subject} ${input.text || ''}`.toLowerCase()
      const mentionPriority = aliases.some((alias) => containsPhrase(haystack, alias)) || input.mentionedJids.length > 0
      return { departmentId: existing.id, departmentName: existing.name, routingReason: 'existing-group-mapping', mentionPriority }
    }
  }

  const departments = await prisma.routingDepartment.findMany({
    where: { isActive: true },
    include: { users: { where: { isActive: true, staff: { status: 'Active' } }, select: { routingPhone: true, routingAliases: true } } },
    orderBy: { id: 'asc' },
  })
  const haystack = `${input.subject} ${input.text || ''}`.toLowerCase()
  const mentionedJids = new Set(input.mentionedJids.map(normalizePhoneJid))
  const businessAliases = (process.env.EVOLUTION_BUSINESS_ALIASES || '').split(',').map((value) => value.trim()).filter(Boolean)
  let mentionPriority = businessAliases.some((alias) => containsPhrase(haystack, alias))

  for (const department of departments) {
    const directMention = department.users.some((user) => user.routingPhone && mentionedJids.has(normalizePhoneJid(user.routingPhone)))
    const aliases = department.users.flatMap((user) => user.routingAliases || [])
    const keywordMatch = containsPhrase(haystack, department.name) || aliases.some((alias) => containsPhrase(haystack, alias))
    if (directMention || keywordMatch) {
      mentionPriority = mentionPriority || directMention || aliases.some((alias) => containsPhrase(haystack, alias))
      return { departmentId: department.id, departmentName: department.name, routingReason: directMention ? 'direct-department-mention' : 'department-keyword', mentionPriority }
    }
  }

  return { departmentId: null, departmentName: null, routingReason: null, mentionPriority }
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
    body: JSON.stringify({ number: input.groupJid, textMessage: { text: input.text }, linkPreview: true, ...(quoted ? { quoted } : {}) }),
  })
}
