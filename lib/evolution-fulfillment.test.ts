import { describe, expect, it } from 'vitest'
import { canMoveEvolutionStage, canPerformFulfillmentAction, dispatchCountdown, isUsableReceipt } from './evolution-fulfillment'

describe('Evolution Phase 2 fulfillment guards', () => {
  it('keeps staff stage changes inside their operational responsibility', () => {
    expect(canMoveEvolutionStage({ role: 'STAFF', routingDepartmentName: 'Sales' }, 'QUOTATION')).toBe(true)
    expect(canMoveEvolutionStage({ role: 'STAFF', routingDepartmentName: 'Sales' }, 'DISPATCHED')).toBe(false)
    expect(canMoveEvolutionStage({ role: 'STAFF', routingDepartmentName: 'Logistics' }, 'DISPATCHED')).toBe(true)
    expect(canMoveEvolutionStage({ role: 'MANAGER' }, 'DISPATCHED')).toBe(true)
  })

  it('limits payment, warehouse and logistics mutations to their departments', () => {
    expect(canPerformFulfillmentAction({ role: 'STAFF', routingDepartmentName: 'Accounts' }, 'payment_verified')).toBe(true)
    expect(canPerformFulfillmentAction({ role: 'STAFF', routingDepartmentName: 'Accounts' }, 'dispatch')).toBe(false)
    expect(canPerformFulfillmentAction({ role: 'STAFF', routingDepartmentName: 'Warehouse' }, 'allocate')).toBe(true)
    expect(canPerformFulfillmentAction({ role: 'STAFF', routingDepartmentName: 'Godown' }, 'allocate')).toBe(true)
    expect(canPerformFulfillmentAction({ role: 'STAFF', routingDepartmentName: 'Logistics' }, 'deliver')).toBe(true)
  })

  it('calculates dispatch countdowns without timezone-sensitive partial-day values', () => {
    const now = new Date('2026-08-27T09:00:00+05:30')
    expect(dispatchCountdown('2026-08-27T20:00:00+05:30', now)).toMatchObject({ state: 'DUE_TODAY', daysRemaining: 0 })
    expect(dispatchCountdown('2026-08-26T20:00:00+05:30', now)).toMatchObject({ state: 'OVERDUE', daysRemaining: -1 })
    expect(dispatchCountdown('2026-08-30T20:00:00+05:30', now)).toMatchObject({ state: 'UPCOMING', daysRemaining: 3 })
  })

  it('accepts only non-empty, bounded Bilty/LR images or PDFs', () => {
    expect(isUsableReceipt({ size: 10, type: 'application/pdf', name: 'lr.pdf' })).toBe(true)
    expect(isUsableReceipt({ size: 10, type: 'text/plain', name: 'note.txt' })).toBe(false)
    expect(isUsableReceipt({ size: 0, type: 'image/png', name: 'lr.png' })).toBe(false)
  })
})
