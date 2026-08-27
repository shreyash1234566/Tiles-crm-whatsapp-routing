import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, isGroupJid, normalizeJid } from '@/lib/evolution-routing'
import { hasSafeLiveEvolutionRollout } from '@/lib/evolution-operations'
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-agent/system-prompt'

const DEFAULT_AGENT_NAME = 'Assistant'
const DEFAULT_FALLBACK_MESSAGE = 'Let me connect you with our team.'
const DEFAULT_LANGUAGES = ['en', 'hi']
const SUPPORTED_LANGUAGES = new Set(['en', 'hi', 'mr', 'gu', 'ta', 'te', 'bn'])

function boundedInteger(value: number | null | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

async function access() {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) return { error: NextResponse.json({ error: 'Only an admin or manager can configure Evolution RAG' }, { status: 403 }) }
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  return { ownerId }
}

export async function GET() {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const [config, knowledge] = await Promise.all([
    prisma.evolutionAgentConfig.findUnique({ where: { userId: resolved.ownerId } }),
    prisma.waAgentConfig.findUnique({ where: { user_id: String(resolved.ownerId) } }),
  ])
  const data = {
    ...(config || {
      enabled: false, draftOnly: true, allowedGroupJids: [], allowedDepartmentIds: [],
    }),
    confidenceThreshold: Number.isFinite(config?.confidenceThreshold ?? knowledge?.confidence_threshold)
      ? Math.min(1, Math.max(0, Number(config?.confidenceThreshold ?? knowledge?.confidence_threshold)))
      : 0.45,
    maxResponseTokens: boundedInteger(config?.maxResponseTokens ?? knowledge?.max_response_tokens, 300, 32, 500),
    responseDelayMs: boundedInteger(config?.responseDelayMs ?? knowledge?.response_delay_ms, 1500, 0, 10_000),
    // The detailed RAG settings pre-date the Evolution workflow and are kept
    // in the same database row for backward compatibility with the worker.
    agent_name: knowledge?.agent_name || DEFAULT_AGENT_NAME,
    system_prompt: knowledge?.system_prompt || DEFAULT_SYSTEM_PROMPT,
    fallback_message: knowledge?.fallback_message || DEFAULT_FALLBACK_MESSAGE,
    languages: knowledge?.languages?.length ? knowledge.languages : DEFAULT_LANGUAGES,
  }
  return NextResponse.json({
    data,
    knowledgeEnabled: Boolean(knowledge?.enabled),
    knowledgeAgentName: knowledge?.agent_name || null,
    serverAutosendEnabled: process.env.EVOLUTION_AGENT_ALLOW_AUTOSEND?.trim().toLowerCase() === 'true',
  })
}

export async function PUT(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 })

  const enabled = body.enabled
  const draftOnly = body.draftOnly
  if (typeof enabled !== 'boolean' || typeof draftOnly !== 'boolean') return NextResponse.json({ error: 'enabled and draftOnly must be booleans' }, { status: 400 })
  const groups = Array.isArray(body.allowedGroupJids) ? body.allowedGroupJids.map((value) => normalizeJid(String(value))).filter(Boolean) : null
  const departments = Array.isArray(body.allowedDepartmentIds) ? body.allowedDepartmentIds.map(Number).filter((value) => Number.isInteger(value) && value > 0) : null
  const existingLegacy = await prisma.waAgentConfig.findUnique({ where: { user_id: String(resolved.ownerId) } })
  const confidenceThreshold = Number(body.confidenceThreshold ?? body.confidence_threshold ?? 0.45)
  const maxResponseTokens = Number(body.maxResponseTokens ?? body.max_response_tokens ?? 300)
  const responseDelayMs = Number(body.responseDelayMs ?? body.response_delay_ms ?? 0)
  const agentName = typeof body.agent_name === 'string' ? body.agent_name.trim() : (existingLegacy?.agent_name || DEFAULT_AGENT_NAME)
  const systemPrompt = typeof body.system_prompt === 'string' ? body.system_prompt.trim() : (existingLegacy?.system_prompt || DEFAULT_SYSTEM_PROMPT)
  const fallbackMessage = typeof body.fallback_message === 'string' ? body.fallback_message.trim() : (existingLegacy?.fallback_message || DEFAULT_FALLBACK_MESSAGE)
  const languages = Array.isArray(body.languages)
    ? [...new Set(body.languages.map((value) => String(value).trim().toLowerCase()).filter((value) => SUPPORTED_LANGUAGES.has(value)))]
    : (existingLegacy?.languages?.filter((value) => SUPPORTED_LANGUAGES.has(value)) || DEFAULT_LANGUAGES)
  if (!groups || groups.length > 250 || groups.some((group) => !isGroupJid(group))) return NextResponse.json({ error: 'allowedGroupJids must contain at most 250 valid group JIDs' }, { status: 400 })
  if (!departments || departments.length > 100) return NextResponse.json({ error: 'allowedDepartmentIds must contain at most 100 positive IDs' }, { status: 400 })
  if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) return NextResponse.json({ error: 'confidenceThreshold must be between 0 and 1' }, { status: 400 })
  if (!Number.isInteger(maxResponseTokens) || maxResponseTokens < 32 || maxResponseTokens > 500) return NextResponse.json({ error: 'maxResponseTokens must be an integer between 32 and 500' }, { status: 400 })
  if (!Number.isInteger(responseDelayMs) || responseDelayMs < 0 || responseDelayMs > 10_000) return NextResponse.json({ error: 'responseDelayMs must be an integer between 0 and 10000' }, { status: 400 })
  if (!agentName || agentName.length > 80) return NextResponse.json({ error: 'agent_name must be between 1 and 80 characters' }, { status: 400 })
  if (!systemPrompt || systemPrompt.length > 50_000) return NextResponse.json({ error: 'system_prompt must be between 1 and 50000 characters' }, { status: 400 })
  if (!fallbackMessage || fallbackMessage.length > 2_000) return NextResponse.json({ error: 'fallback_message must be between 1 and 2000 characters' }, { status: 400 })
  if (languages.length === 0 || languages.length > SUPPORTED_LANGUAGES.size) return NextResponse.json({ error: 'languages must contain at least one supported language' }, { status: 400 })

  // Live replies are deliberately a narrow, named test-group rollout. The
  // environment switch remains a second server-only approval boundary.
  if (!hasSafeLiveEvolutionRollout(enabled, draftOnly, groups)) {
    return NextResponse.json({ error: 'Live Evolution replies require exactly one explicitly allowlisted test group. Keep draft mode on for broader review.' }, { status: 400 })
  }

  // Drafts may use broad review queues. Live sending always needs the single
  // named test group above plus EVOLUTION_AGENT_ALLOW_AUTOSEND=true.
  const [data] = await prisma.$transaction([
    prisma.evolutionAgentConfig.upsert({
      where: { userId: resolved.ownerId },
      update: { enabled, draftOnly, allowedGroupJids: [...new Set(groups)], allowedDepartmentIds: [...new Set(departments)], confidenceThreshold, maxResponseTokens, responseDelayMs },
      create: { userId: resolved.ownerId, enabled, draftOnly, allowedGroupJids: [...new Set(groups)], allowedDepartmentIds: [...new Set(departments)], confidenceThreshold, maxResponseTokens, responseDelayMs },
    }),
    prisma.waAgentConfig.upsert({
      where: { user_id: String(resolved.ownerId) },
      update: { enabled, agent_name: agentName, system_prompt: systemPrompt, fallback_message: fallbackMessage, confidence_threshold: confidenceThreshold, max_response_tokens: maxResponseTokens, response_delay_ms: responseDelayMs, languages },
      create: { user_id: String(resolved.ownerId), enabled, agent_name: agentName, system_prompt: systemPrompt, fallback_message: fallbackMessage, confidence_threshold: confidenceThreshold, max_response_tokens: maxResponseTokens, response_delay_ms: responseDelayMs, languages },
    }),
  ])
  return NextResponse.json({
    data: { ...data, agent_name: agentName, system_prompt: systemPrompt, fallback_message: fallbackMessage, languages },
  })
}

export const POST = PUT
