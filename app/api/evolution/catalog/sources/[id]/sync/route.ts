import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { syncEvolutionCatalogSource } from '@/lib/evolution-catalog-sync'

function canManage(role: string | undefined): boolean { return role === 'ADMIN' || role === 'MANAGER' }

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can sync a catalog source' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const { id } = await context.params
  try {
    return NextResponse.json({ data: await syncEvolutionCatalogSource(id, { expectedOwnerId: ownerId, trigger: 'MANUAL' }) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 1_000) : 'Catalog sync failed' }, { status: 422 })
  }
}
