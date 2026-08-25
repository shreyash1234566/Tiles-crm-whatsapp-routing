import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findStaff: vi.fn(),
  createSession: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUser }, staff: { findUnique: mocks.findStaff } } }))
vi.mock('@/lib/session', () => ({ createSession: mocks.createSession }))

import { POST } from '@/app/api/auth/login/route'

const passwordHash = await bcrypt.hash('employee-password', 4)

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function user(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    email: 'employee@example.com',
    hashedPassword: passwordHash,
    name: 'Employee',
    role: 'STAFF',
    staffId: 12,
    isActive: true,
    routingDepartmentId: 2,
    staff: { status: 'Active' },
    ...overrides,
  }
}

describe('employee login route', () => {
  beforeEach(() => {
    mocks.findUser.mockReset()
    mocks.findStaff.mockReset()
    mocks.createSession.mockReset()
  })

  it('authenticates an employee by email and routes them to the department inbox', async () => {
    mocks.findUser.mockResolvedValue(user())

    const response = await POST(request({ type: 'staff-credentials', email: ' Employee@Example.com ', password: 'employee-password' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, redirectTo: '/routing-crm' })
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'employee@example.com' } }))
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ id: '7', staffId: 12, role: 'STAFF' }))
  })

  it('routes an unassigned employee to the Staff Portal rather than exposing all tickets', async () => {
    mocks.findUser.mockResolvedValue(user({ routingDepartmentId: null }))

    const response = await POST(request({ type: 'staff-credentials', email: 'employee@example.com', password: 'employee-password' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.redirectTo).toBe('/staff-portal')
  })

  it('does not allow Staff accounts through the Admin login mode', async () => {
    mocks.findUser.mockResolvedValue(user())

    const response = await POST(request({ type: 'credentials', email: 'employee@example.com', password: 'employee-password' }))

    expect(response.status).toBe(401)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('rejects an employee whose Staff profile is inactive', async () => {
    mocks.findUser.mockResolvedValue(user({ staff: { status: 'Inactive' } }))

    const response = await POST(request({ type: 'staff-credentials', email: 'employee@example.com', password: 'employee-password' }))

    expect(response.status).toBe(401)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})
