/** Guardrails for optional automation. Manual team replies are never blocked. */
export function maxEvolutionAutoRepliesPerTicket(): number {
  const configured = Number(process.env.EVOLUTION_AGENT_MAX_AUTOREPLIES_PER_TICKET || 2)
  return Number.isInteger(configured) && configured >= 0 && configured <= 10 ? configured : 2
}

function integerHour(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback
}

/** Default to no quiet period. Configure a local timezone and a start/end hour
 * (for example 21 and 9) to defer automated follow-ups overnight. */
export function isEvolutionQuietHour(now = new Date()): boolean {
  const start = process.env.EVOLUTION_QUIET_HOURS_START
  const end = process.env.EVOLUTION_QUIET_HOURS_END
  if (start == null || end == null) return false
  const startHour = integerHour(start, -1); const endHour = integerHour(end, -1)
  if (startHour < 0 || endHour < 0 || startHour === endHour) return false
  const timeZone = process.env.EVOLUTION_OPERATIONS_TIMEZONE || 'Asia/Kolkata'
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  if (!Number.isInteger(hour)) return false
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour
}

/** A short retry keeps deferred work visible and avoids timezone arithmetic
 * mistakes around DST. The worker repeats only while quiet hours remain. */
export function nextEvolutionQuietRetryAt(now = new Date()): Date {
  return new Date(now.getTime() + 15 * 60 * 1000)
}
