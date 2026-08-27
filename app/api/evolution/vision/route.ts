import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getEvolutionVisionQueue } from '@/lib/queues/jobs'
import { isEvolutionVisionEnabled } from '@/lib/evolution-vision'
import { recordEvolutionWorkerMetric } from '@/lib/evolution-worker-metrics'

function canManage(role: string | undefined) { return role === 'ADMIN' || role === 'MANAGER' }

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can review visual matches' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId(); if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const groupId = new URL(request.url).searchParams.get('group_id') || undefined
  const data = await prisma.evolutionVisionMatch.findMany({ where: { userId: ownerId, ...(groupId ? { groupId } : {}) }, include: { candidate: { include: { catalogItem: { select: { id: true, sku: true, name: true, lotNumber: true, shadeCode: true, photoUrls: true } } } } }, orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ data, enabled: isEvolutionVisionEnabled() })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can enqueue vision work' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId(); if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  if (!isEvolutionVisionEnabled()) return NextResponse.json({ error: 'Local vision is disabled. Set EVOLUTION_VISION_ENABLED=true only after the model is available on this VPS.' }, { status: 409 })
  const body = await request.json().catch(() => ({})) as { action?: unknown; lotMediaId?: unknown; groupId?: unknown; messageId?: unknown }
  const action = String(body.action || '')
  const queue = getEvolutionVisionQueue()
  if (action === 'index') {
    const lotMediaId = String(body.lotMediaId || '').trim()
    const media = await prisma.stoneLotMedia.findFirst({ where: { id: lotMediaId, mediaType: { in: ['IMAGE', 'image'] }, shareable: true, lot: { shareable: true } }, select: { id: true } })
    if (!media) return NextResponse.json({ error: 'Only dealer-shareable lot media can be indexed' }, { status: 404 })
    const job = await queue.add('index-lot-media', { ownerUserId: ownerId, lotMediaId: media.id, sourceUrl: '' }, { jobId: `vision-index:${media.id}` })
    void recordEvolutionWorkerMetric({ userId: ownerId, queue: 'evolution-vision', jobId: String(job.id), operation: 'index_lot_media', status: 'QUEUED', metadata: { lotMediaId: media.id } })
    return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
  }
  if (action === 'match') {
    const groupId = String(body.groupId || '').trim(); const messageId = String(body.messageId || '').trim()
    const message = await prisma.evolutionGroupMessage.findFirst({ where: { messageId, mediaUrl: { not: null }, messageType: { contains: 'image', mode: 'insensitive' }, group: { id: groupId, userId: ownerId, inquiry: { is: { dealerId: { not: null } } } } }, select: { messageId: true, mediaUrl: true } })
    if (!message?.mediaUrl) return NextResponse.json({ error: 'Choose an image from a dealer-linked group with locally stored media' }, { status: 404 })
    const job = await queue.add('match-group-image', { ownerUserId: ownerId, groupId, requestedMessageId: message.messageId, sourceUrl: message.mediaUrl }, { jobId: `vision-match:${groupId}:${message.messageId}` })
    void recordEvolutionWorkerMetric({ userId: ownerId, queue: 'evolution-vision', jobId: String(job.id), operation: 'match_group_image', status: 'QUEUED', metadata: { groupId, messageId } })
    return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
  }
  return NextResponse.json({ error: 'action must be index or match' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can review visual matches' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId(); if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown }
  const id = String(body.id || '').trim(); const action = String(body.action || '').toUpperCase()
  if (!id || !['APPROVED', 'REJECTED'].includes(action)) return NextResponse.json({ error: 'id and action APPROVED or REJECTED are required' }, { status: 400 })
  const changed = await prisma.evolutionVisionMatch.updateMany({ where: { id, userId: ownerId, status: 'SUGGESTED' }, data: { status: action, reviewedByUserId: Number(session.user.id), reviewedAt: new Date() } })
  if (!changed.count) return NextResponse.json({ error: 'Visual match is no longer awaiting review' }, { status: 409 })
  return NextResponse.json({ data: await prisma.evolutionVisionMatch.findUniqueOrThrow({ where: { id } }) })
}
