import { describe, expect, it } from 'vitest'
import { getEmployeeHomePath, normalizeEmployeeEmail, normalizeRoutingPhone, routingPhoneSchema } from './employee-accounts'

describe('employee account helpers', () => {
  it('normalizes employee email for one canonical login identity', () => {
    expect(normalizeEmployeeEmail('  Employee@Example.COM ')).toBe('employee@example.com')
  })

  it('normalizes supported routing phone formats to digits', () => {
    expect(normalizeRoutingPhone('+91 (98765) 43210')).toBe('919876543210')
    expect(normalizeRoutingPhone('not-a-phone')).toBeNull()
  })

  it('rejects routing phones outside the bounded digit range', () => {
    expect(routingPhoneSchema.safeParse('1234567').success).toBe(false)
    expect(routingPhoneSchema.safeParse('+919876543210').success).toBe(true)
  })

  it('lands routed staff in the department inbox', () => {
    expect(getEmployeeHomePath({ role: 'STAFF', staffId: 7, routingDepartmentId: 2, staffStatus: 'Active' })).toBe('/routing-crm')
  })

  it('lands unassigned staff in the staff portal', () => {
    expect(getEmployeeHomePath({ role: 'STAFF', staffId: 7, routingDepartmentId: null, staffStatus: 'Active' })).toBe('/staff-portal')
    expect(getEmployeeHomePath({ role: 'STAFF', staffId: null, routingDepartmentId: 2, staffStatus: 'Active' })).toBe('/staff-portal')
    expect(getEmployeeHomePath({ role: 'STAFF', staffId: 7, routingDepartmentId: 2, routingDepartmentActive: false, staffStatus: 'Active' })).toBe('/staff-portal')
  })

  it('keeps managers and admins on the main dashboard', () => {
    expect(getEmployeeHomePath({ role: 'ADMIN', staffId: null, routingDepartmentId: null })).toBe('/')
    expect(getEmployeeHomePath({ role: 'MANAGER', staffId: null, routingDepartmentId: null })).toBe('/')
  })
})
