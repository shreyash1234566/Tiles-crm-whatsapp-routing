import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionConnectionState, getEvolutionQrCode } from '@/lib/evolution-routing'

async function requireAdmin() {
  const session = await getSession()
  if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) return null
  return session.user
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await getEvolutionConnectionState())
  } catch (error) {
    return NextResponse.json({ configured: true, state: 'error', error: error instanceof Error ? error.message : 'Evolution API unavailable' }, { status: 502 })
  }
}

export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const qr = await getEvolutionQrCode()
    return NextResponse.json({ configured: true, qr })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Evolution API unavailable' }, { status: 502 })
  }
}
