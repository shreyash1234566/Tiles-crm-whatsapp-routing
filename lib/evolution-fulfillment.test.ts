import { describe, expect, it } from 'vitest'
import { allowedFulfillmentTransitions, canMoveEvolutionStage, canPerformFulfillmentAction, dispatchCountdown, hasApprovedDealerCredit, isPricedFulfillmentOrder, isUsableReceipt } from './evolution-fulfillment'

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
    expect(dispatchCountdown('2026-08-27T20:00:00+05:30', now, 'Asia/Kolkata')).toMatchObject({ state: 'DUE_TODAY', daysRemaining: 0 })
    expect(dispatchCountdown('2026-08-26T20:00:00+05:30', now, 'Asia/Kolkata')).toMatchObject({ state: 'OVERDUE', daysRemaining: -1 })
    expect(dispatchCountdown('2026-08-30T20:00:00+05:30', now, 'Asia/Kolkata')).toMatchObject({ state: 'UPCOMING', daysRemaining: 3 })
  })

  it('does not let lifecycle transitions bypass controlled fulfillment actions', () => {
    const manager = { role: 'MANAGER' }
    expect(allowedFulfillmentTransitions(manager, 'CONFIRMED', { hasOrder: false })).not.toContain('PAYMENT_PENDING')
    expect(allowedFulfillmentTransitions(manager, 'CONFIRMED', { hasOrder: true, isPricedOrder: false })).not.toContain('PAYMENT_PENDING')
    expect(allowedFulfillmentTransitions(manager, 'CONFIRMED', { hasOrder: true, isPricedOrder: true })).toContain('PAYMENT_PENDING')
    expect(allowedFulfillmentTransitions(manager, 'PAYMENT_PENDING', { hasOrder: true, isPricedOrder: true, orderStatus: 'ENQUIRY' })).not.toContain('ALLOCATED')
    expect(allowedFulfillmentTransitions(manager, 'ALLOCATED', { hasOrder: true, isPricedOrder: true, orderStatus: 'ALLOCATED', hasActiveAllocation: true })).toContain('DISPATCH_PENDING')
    expect(allowedFulfillmentTransitions(manager, 'DISPATCH_PENDING', { hasOrder: true, isPricedOrder: true, orderStatus: 'ALLOCATED', hasActiveAllocation: true })).not.toContain('DISPATCHED')
  })

  it('requires every fulfillment line to be linked and positively priced', () => {
    expect(isPricedFulfillmentOrder({ total: 10_000, items: [{ productId: 1, quantity: 10, rate: 1_000, amount: 10_000 }] })).toBe(true)
    expect(isPricedFulfillmentOrder({ total: 10_000, items: [{ productId: null, quantity: 10, rate: 1_000, amount: 10_000 }] })).toBe(false)
    expect(isPricedFulfillmentOrder({ total: 10_000, items: [{ productId: 1, quantity: 10, rate: 0, amount: 0 }] })).toBe(false)
  })

  it('requires positive credit days and a sufficient positive credit limit', () => {
    expect(hasApprovedDealerCredit({ creditDays: 30, creditLimit: 100_000, balanceDue: 80_000 })).toBe(true)
    expect(hasApprovedDealerCredit({ creditDays: 30, creditLimit: 0, balanceDue: 80_000 })).toBe(false)
    expect(hasApprovedDealerCredit({ creditDays: 0, creditLimit: 100_000, balanceDue: 80_000 })).toBe(false)
    expect(hasApprovedDealerCredit({ creditDays: 30, creditLimit: 50_000, balanceDue: 80_000 })).toBe(false)
  })

  it('accepts only non-empty, bounded Bilty/LR images or PDFs', () => {
    expect(isUsableReceipt({ size: 10, type: 'application/pdf', name: 'lr.pdf' })).toBe(true)
    expect(isUsableReceipt({ size: 10, type: 'text/plain', name: 'note.txt' })).toBe(false)
    expect(isUsableReceipt({ size: 0, type: 'image/png', name: 'lr.png' })).toBe(false)
  })
})
