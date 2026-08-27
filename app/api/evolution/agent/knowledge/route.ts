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

export async function GET() {
  const resolved = await access()
  if ('error' in resolved) return resolved.error

  try {
    const docs = await prisma.waKnowledgeDoc.findMany({
      where: { user_id: resolved.ownerId },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { chunks: true } } },
    })

    return NextResponse.json(docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      source_type: doc.source_type,
      char_count: doc.char_count,
      status: doc.status,
      error: doc.error,
      chunk_count: doc._count.chunks,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at.toISOString(),
    })))
  } catch (error) {
    console.error('[evolution/agent/knowledge GET]', error)
    return NextResponse.json({ error: 'Unable to load Evolution RAG knowledge' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const resolved = await access()
  if ('error' in resolved) return resolved.error

  try {
    const body = await request.json().catch(() => null) as { title?: unknown; raw_text?: unknown; source_type?: unknown } | null
    if (!body) return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 })

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const rawText = typeof body.raw_text === 'string' ? body.raw_text : ''
    const sourceType = typeof body.source_type === 'string' && body.source_type.trim()
      ? body.source_type.trim().slice(0, 40)
      : 'text'

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (title.length > 200) return NextResponse.json({ error: 'title must be 200 characters or fewer' }, { status: 400 })
    if (!rawText.trim()) return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
    if (rawText.length > 500_000) return NextResponse.json({ error: 'raw_text exceeds 500,000 character limit' }, { status: 400 })

    const doc = await prisma.waKnowledgeDoc.create({
      data: {
        user_id: resolved.ownerId,
        title,
        raw_text: rawText,
        char_count: rawText.length,
        source_type: sourceType,
        status: 'pending',
      },
    })

    // Index asynchronously so ONNX/model startup never blocks or crashes the
    // request. The document is marked as error by the worker on failure.
    import('@/lib/ai-agent/agent-worker')
      .then(({ indexKnowledgeDoc }) => indexKnowledgeDoc(doc.id))
      .catch(async (error) => {
        console.error(`[evolution/agent/knowledge] indexing failed for ${doc.id}:`, error)
        await prisma.waKnowledgeDoc.update({
          where: { id: doc.id },
          data: { status: 'error', error: error instanceof Error ? error.message : 'Indexing failed' },
        }).catch((updateError) => console.error('[evolution/agent/knowledge] failed to persist indexing error', updateError))
      })

    return NextResponse.json({ success: true, id: doc.id, status: 'pending' }, { status: 201 })
  } catch (error) {
    console.error('[evolution/agent/knowledge POST]', error)
    return NextResponse.json({ error: 'Unable to create Evolution RAG knowledge document' }, { status: 500 })
  }
}
