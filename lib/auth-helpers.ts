import { getSession as getCustomSession } from './session'
import type { UserRole } from '@prisma/client'
import { prisma } from './db'

export async function getSession() {
  const session = await getCustomSession()
  if (!session) return null

  const numericId = Number(session.id)
  if (!Number.isInteger(numericId)) return null

  const currentUser = await prisma.user.findUnique({
    where: { id: numericId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      staffId: true,
      staff: { select: { status: true } },
      routingDepartmentId: true,
      routingDepartment: { select: { isActive: true } },
    },
  })

  if (!currentUser?.isActive) return null
  if (currentUser.role === 'STAFF' && (!currentUser.staffId || currentUser.staff?.status !== 'Active')) return null

  return {
    user: {
      id: String(currentUser.id),
      numericId: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      role: currentUser.role as UserRole,
      staffId: currentUser.staffId,
      routingDepartmentId: currentUser.routingDepartment?.isActive === false ? null : (currentUser.routingDepartmentId ?? null),
    }
  }
}

export async function requireAuth() {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireRole(...roles: UserRole[]) {
  const session = await requireAuth()
  if (!roles.includes(session.user.role)) {
    throw new Error('Forbidden')
  }
  return session
}

export async function requireStaffIdentity(staffId: number) {
  const session = await requireAuth()
  if (session.user.role === 'ADMIN' || session.user.role === 'MANAGER') return session
  if (session.user.role !== 'STAFF' || session.user.staffId !== staffId) {
    throw new Error('Forbidden')
  }
  return session
}
