import { describe, expect, it } from 'vitest'
import { firstResponseMinutes, isConvertedEvolutionInquiry, median } from './evolution-metrics'

describe('Evolution dashboard metrics', () => {
  it('derives first response from the actual inbound/outbound message pair', () => {
    const openedAt = new Date('2026-08-27T09:00:00.000Z')
    expect(firstResponseMinutes(openedAt, [
      { fromMe: true, createdAt: '2026-08-27T08:59:00.000Z' },
      { fromMe: false, createdAt: '2026-08-27T09:02:00.000Z' },
      { fromMe: false, createdAt: '2026-08-27T09:03:00.000Z' },
      { fromMe: true, createdAt: '2026-08-27T09:07:30.000Z' },
    ])).toBe(5.5)
  })

  it('does not invent a response when no outbound message exists', () => {
    expect(firstResponseMinutes('2026-08-27T09:00:00.000Z', [
      { fromMe: false, createdAt: '2026-08-27T09:01:00.000Z' },
    ])).toBeNull()
  })

  it('counts conversion only when a real dealer order is linked', () => {
    expect(isConvertedEvolutionInquiry({ convertedOrderId: 42 })).toBe(true)
    expect(isConvertedEvolutionInquiry({ convertedOrderId: null })).toBe(false)
  })

  it('calculates a true median for even and odd samples', () => {
    expect(median([10, 2, 6])).toBe(6)
    expect(median([10, 2, 6, 8])).toBe(7)
    expect(median([])).toBeNull()
  })
})
