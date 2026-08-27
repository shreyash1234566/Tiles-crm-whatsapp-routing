import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'

async function access() {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: NextResponse.json({ error: 'Only an admin or manager can manage Evolution RAG knowledge' }, { status: 403 }) }
  }
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return { error: NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 }) }
  return { ownerId: String(ownerId) }
}

async function ownedDocument(id: string, ownerId: string) {
  const doc = await prisma.waKnowledgeDoc.findUnique({ where: { id }, select: { user_id: true } })
  if (!doc) return { error: NextResponse.json({ error: 'Document not found' }, { status: 404 }) }
  if (doc.user_id !== ownerId) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error

  try {
    const { id } = await context.params
    const owned = await ownedDocument(id, resolved.ownerId)
    if ('error' in owned) return owned.error
    await prisma.waKnowledgeDoc.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[evolution/agent/knowledge/[id] DELETE]', error)
    return NextResponse.json({ error: 'Unable to delete Evolution RAG knowledge document' }, { status: 500 })
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error

  try {
    const { id } = await context.params
    const owned = await ownedDocument(id, resolved.ownerId)
    if ('error' in owned) return owned.error

    const { indexKnowledgeDoc } = await import('@/lib/ai-agent/agent-worker')
    await prisma.waKnowledgeDoc.update({ where: { id }, data: { status: 'pending', error: null } })
    indexKnowledgeDoc(id).catch((error) => console.error(`[evolution/agent/knowledge] re-index failed for ${id}:`, error))
    return NextResponse.json({ success: true, status: 'pending' })
  } catch (error) {
    console.error('[evolution/agent/knowledge/[id] POST]', error)
    return NextResponse.json({ error: 'Unable to re-index Evolution RAG knowledge document' }, { status: 500 })
  }
}
