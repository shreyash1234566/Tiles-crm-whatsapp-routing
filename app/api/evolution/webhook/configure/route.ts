import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-helpers'
import { configureEvolutionWebhook } from '@/lib/evolution-routing'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const configuredUrl = process.env.EVOLUTION_WEBHOOK_URL?.trim()
  const origin = new URL(request.url).origin
  const webhookUrl = configuredUrl || `${origin}/api/evolution/webhook`
  try {
    const data = await configureEvolutionWebhook(webhookUrl)
    return NextResponse.json({ ok: true, webhookUrl, data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to configure Evolution webhook' }, { status: 502 })
  }
}
