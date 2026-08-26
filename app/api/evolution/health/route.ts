import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'

export async function GET() {
  const session = await getSession()
  if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const data = await prisma.evolutionWebhookHealth.findUnique({ where: { ownerUserId } })
  const thresholdMinutes = Math.min(Math.max(Number(process.env.EVOLUTION_WEBHOOK_ALERT_MINUTES || 15), 1), 24 * 60)
  const ageMinutes = data?.lastReceivedAt ? Math.floor((Date.now() - data.lastReceivedAt.getTime()) / 60_000) : null
  const alert = ageMinutes === null || ageMinutes > thresholdMinutes
  return NextResponse.json({
    data: {
      lastReceivedAt: data?.lastReceivedAt || null,
      lastEvent: data?.lastEvent || null,
      lastMessageId: data?.lastMessageId || null,
      lastCorrelationId: data?.lastCorrelationId || null,
      lastErrorAt: data?.lastErrorAt || null,
      lastError: data?.lastError || null,
      ageMinutes,
      thresholdMinutes,
      alert,
    },
  })
}
