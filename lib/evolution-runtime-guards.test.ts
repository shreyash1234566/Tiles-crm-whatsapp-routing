import { afterEach, describe, expect, it } from 'vitest'
import { isEvolutionQuietHour, maxEvolutionAutoRepliesPerTicket } from './evolution-runtime-guards'

afterEach(() => {
  delete process.env.EVOLUTION_QUIET_HOURS_START
  delete process.env.EVOLUTION_QUIET_HOURS_END
  delete process.env.EVOLUTION_OPERATIONS_TIMEZONE
  delete process.env.EVOLUTION_AGENT_MAX_AUTOREPLIES_PER_TICKET
})

describe('Evolution automation guardrails', () => {
  it('does not defer sends unless both quiet-hour bounds are configured', () => {
    expect(isEvolutionQuietHour(new Date('2026-01-01T00:00:00Z'))).toBe(false)
  })

  it('handles an overnight quiet window in the configured operations timezone', () => {
    process.env.EVOLUTION_QUIET_HOURS_START = '21'
    process.env.EVOLUTION_QUIET_HOURS_END = '9'
    process.env.EVOLUTION_OPERATIONS_TIMEZONE = 'Asia/Kolkata'
    expect(isEvolutionQuietHour(new Date('2026-01-01T17:00:00Z'))).toBe(true) // 22:30 IST
    expect(isEvolutionQuietHour(new Date('2026-01-01T05:00:00Z'))).toBe(false) // 10:30 IST
  })

  it('bounds the automatic reply cap and rejects invalid configuration', () => {
    expect(maxEvolutionAutoRepliesPerTicket()).toBe(2)
    process.env.EVOLUTION_AGENT_MAX_AUTOREPLIES_PER_TICKET = '4'
    expect(maxEvolutionAutoRepliesPerTicket()).toBe(4)
    process.env.EVOLUTION_AGENT_MAX_AUTOREPLIES_PER_TICKET = '999'
    expect(maxEvolutionAutoRepliesPerTicket()).toBe(2)
  })
})
