import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCustomSession: vi.fn(),
  findUser: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSession: mocks.getCustomSession }))
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUser } } }))

import { getSession, requireStaffIdentity } from '@/lib/auth-helpers'

const session = {
  id: '7',
  email: 'employee@example.com',
  name: 'Employee',
  role: 'STAFF',
  staffId: 12,
}

function dbUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    email: 'employee@example.com',
    name: 'Employee',
    role: 'STAFF',
    isActive: true,
    staffId: 12,
    staff: { status: 'Active' },
    routingDepartmentId: 2,
    routingDepartment: { isActive: true },
    ...overrides,
  }
}

describe('current session authorization', () => {
  beforeEach(() => {
    mocks.getCustomSession.mockReset()
    mocks.findUser.mockReset()
    mocks.getCustomSession.mockResolvedValue(session)
  })

  it('uses the current database role and profile identity', async () => {
    mocks.findUser.mockResolvedValue(dbUser({ role: 'MANAGER', staffId: null }))

    const result = await getSession()

    expect(result?.user).toMatchObject({ id: '7', role: 'MANAGER', staffId: null })
  })

  it('rejects a deactivated login on the next protected request', async () => {
    mocks.findUser.mockResolvedValue(dbUser({ isActive: false }))

    await expect(getSession()).resolves.toBeNull()
  })

  it('rejects an inactive or unlinked Staff profile', async () => {
    mocks.findUser.mockResolvedValue(dbUser({ staff: { status: 'Inactive' } }))
    await expect(getSession()).resolves.toBeNull()

    mocks.findUser.mockResolvedValue(dbUser({ staffId: null, staff: null }))
    await expect(getSession()).resolves.toBeNull()
  })

  it('fails closed for a disabled routing department and protects Staff ownership', async () => {
    mocks.findUser.mockResolvedValue(dbUser({ routingDepartment: { isActive: false } }))
    const result = await getSession()
    expect(result?.user.routingDepartmentId).toBeNull()

    mocks.findUser.mockResolvedValue(dbUser())
    await expect(requireStaffIdentity(99)).rejects.toThrow('Forbidden')
  })
})
