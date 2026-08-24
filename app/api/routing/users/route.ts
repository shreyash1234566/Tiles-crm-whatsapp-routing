import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth-helpers'

export async function GET() {
  try {
    await requireRole('ADMIN', 'MANAGER')
    const departments = await prisma.routingDepartment.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    })
    return NextResponse.json({ departments })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('[routing/users] failed to load departments', error)
    return NextResponse.json({ error: 'Unable to load routing departments' }, { status: 500 })
  }
}
