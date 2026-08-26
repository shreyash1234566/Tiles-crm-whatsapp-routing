import { describe, expect, it } from 'vitest'
import { canAccessDepartmentWorkItem, normalizeWorkItemFilter, workItemRecipientIds } from './evolution-work-items'

describe('department-scoped Evolution work items', () => {
  const salesItem = { departmentId: 10 }
  const accountsItem = { departmentId: 20 }

  it('shows staff only work from their own department', () => {
    expect(canAccessDepartmentWorkItem({ role: 'STAFF', routingDepartmentId: 10 }, salesItem)).toBe(true)
    expect(canAccessDepartmentWorkItem({ role: 'STAFF', routingDepartmentId: 10 }, accountsItem)).toBe(false)
    expect(canAccessDepartmentWorkItem({ role: 'STAFF', routingDepartmentId: null }, salesItem)).toBe(false)
  })

  it('allows managers to oversee all work items without granting that scope to staff', () => {
    expect(canAccessDepartmentWorkItem({ role: 'ADMIN', routingDepartmentId: null }, accountsItem)).toBe(true)
    expect(canAccessDepartmentWorkItem({ role: 'MANAGER', routingDepartmentId: null }, accountsItem)).toBe(true)
    expect(canAccessDepartmentWorkItem({ role: 'STAFF', routingDepartmentId: 20 }, salesItem)).toBe(false)
  })

  it('notifies only the routed department plus oversight roles', () => {
    const recipients = workItemRecipientIds([
      { id: 1, role: 'ADMIN', routingDepartmentId: null },
      { id: 2, role: 'MANAGER', routingDepartmentId: null },
      { id: 3, role: 'STAFF', routingDepartmentId: 10 },
      { id: 4, role: 'STAFF', routingDepartmentId: 20 },
    ], 10, 4)
    expect(recipients.sort()).toEqual([1, 2, 3])
  })

  it('keeps the Active, Done, History query values deterministic', () => {
    expect(normalizeWorkItemFilter(null)).toBe('active')
    expect(normalizeWorkItemFilter('done')).toBe('done')
    expect(normalizeWorkItemFilter('history')).toBe('history')
    expect(normalizeWorkItemFilter('anything-else')).toBe('active')
  })
})
