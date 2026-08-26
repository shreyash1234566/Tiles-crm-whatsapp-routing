import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId, isGroupJid, normalizeJid } from '@/lib/evolution-routing'
import { hasSafeLiveEvolutionRollout } from '@/lib/evolution-operations'

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
    prisma.waAgentConfig.findUnique({ where: { user_id: String(resolved.ownerId) }, select: { enabled: true, agent_name: true, confidence_threshold: true } }),
  ])
  return NextResponse.json({
    data: config || {
      enabled: false, draftOnly: true, allowedGroupJids: [], allowedDepartmentIds: [], confidenceThreshold: 0.45, maxResponseTokens: 300, responseDelayMs: 0,
    },
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
  const confidenceThreshold = Number(body.confidenceThreshold)
  const maxResponseTokens = Number(body.maxResponseTokens)
  const responseDelayMs = Number(body.responseDelayMs)
  if (!groups || groups.length > 250 || groups.some((group) => !isGroupJid(group))) return NextResponse.json({ error: 'allowedGroupJids must contain at most 250 valid group JIDs' }, { status: 400 })
  if (!departments || departments.length > 100) return NextResponse.json({ error: 'allowedDepartmentIds must contain at most 100 positive IDs' }, { status: 400 })
  if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) return NextResponse.json({ error: 'confidenceThreshold must be between 0 and 1' }, { status: 400 })
  if (!Number.isInteger(maxResponseTokens) || maxResponseTokens < 32 || maxResponseTokens > 500) return NextResponse.json({ error: 'maxResponseTokens must be an integer between 32 and 500' }, { status: 400 })
  if (!Number.isInteger(responseDelayMs) || responseDelayMs < 0 || responseDelayMs > 10_000) return NextResponse.json({ error: 'responseDelayMs must be an integer between 0 and 10000' }, { status: 400 })

  // Live replies are deliberately a narrow, named test-group rollout. The
  // environment switch remains a second server-only approval boundary.
  if (!hasSafeLiveEvolutionRollout(enabled, draftOnly, groups)) {
    return NextResponse.json({ error: 'Live Evolution replies require exactly one explicitly allowlisted test group. Keep draft mode on for broader review.' }, { status: 400 })
  }

  // Drafts may use broad review queues. Live sending always needs the single
  // named test group above plus EVOLUTION_AGENT_ALLOW_AUTOSEND=true.
  const data = await prisma.evolutionAgentConfig.upsert({
    where: { userId: resolved.ownerId },
    update: { enabled, draftOnly, allowedGroupJids: [...new Set(groups)], allowedDepartmentIds: [...new Set(departments)], confidenceThreshold, maxResponseTokens, responseDelayMs },
    create: { userId: resolved.ownerId, enabled, draftOnly, allowedGroupJids: [...new Set(groups)], allowedDepartmentIds: [...new Set(departments)], confidenceThreshold, maxResponseTokens, responseDelayMs },
  })
  return NextResponse.json({ data })
}

export const POST = PUT
