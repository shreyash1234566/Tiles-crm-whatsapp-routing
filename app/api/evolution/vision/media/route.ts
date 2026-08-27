import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { getEvolutionVisionQueue } from '@/lib/queues/jobs'
import { isEvolutionVisionEnabled } from '@/lib/evolution-vision'

function canManage(role: string | undefined) { return role === 'ADMIN' || role === 'MANAGER' }

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can manage visual media' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const data = await prisma.stoneLotMedia.findMany({
    where: { mediaType: { in: ['IMAGE', 'image'] }, shareable: true, lot: { shareable: true } },
    orderBy: { updatedAt: 'desc' }, take: 100,
    select: { id: true, url: true, patternTags: true, shadeCode: true, qualityGrade: true, visionEmbeddings: { where: { userId: ownerId }, select: { id: true, model: true, updatedAt: true } }, lot: { select: { lotNumber: true, product: { select: { name: true, sku: true } } } } },
  })
  return NextResponse.json({ data, enabled: isEvolutionVisionEnabled() })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can index visual media' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  if (!isEvolutionVisionEnabled()) return NextResponse.json({ error: 'Local vision is disabled. Enable EVOLUTION_VISION_ENABLED after validating the model cache.' }, { status: 409 })
  const body = await request.json().catch(() => ({})) as { lotMediaId?: unknown }
  const lotMediaId = String(body.lotMediaId || '').trim()
  if (!lotMediaId) return NextResponse.json({ error: 'lotMediaId is required' }, { status: 400 })
  const media = await prisma.stoneLotMedia.findFirst({ where: { id: lotMediaId, mediaType: { in: ['IMAGE', 'image'] }, shareable: true, lot: { shareable: true } }, select: { id: true } })
  if (!media) return NextResponse.json({ error: 'Only dealer-shareable lot images can be indexed' }, { status: 404 })
  const job = await getEvolutionVisionQueue().add('index-lot-media', { ownerUserId: ownerId, lotMediaId: media.id, sourceUrl: '' }, { jobId: `vision-index:${media.id}` })
  return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
}
