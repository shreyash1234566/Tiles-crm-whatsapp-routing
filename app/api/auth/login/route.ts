import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createSession } from '@/lib/session'
import { employeeEmailSchema, getEmployeeHomePath } from '@/lib/employee-accounts'

async function issueLogin(user: {
  id: number
  email: string
  name: string
  role: string
  staffId: number | null
  isActive: boolean
  routingDepartmentId: number | null
  routingDepartment?: { isActive: boolean } | null
  staff?: { status: string } | null
}) {
  if (!user.isActive) return NextResponse.json({ error: 'Login is disabled. Please contact Admin.' }, { status: 401 })
  if (user.role === 'STAFF' && (!user.staffId || user.staff?.status !== 'Active')) {
    return NextResponse.json({ error: 'Your employee profile is inactive or not linked. Please contact Admin.' }, { status: 401 })
  }

  await createSession({
    id: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    staffId: user.staffId,
  })

  return NextResponse.json({ success: true, redirectTo: getEmployeeHomePath({ role: user.role, staffId: user.staffId, routingDepartmentId: user.routingDepartmentId, routingDepartmentActive: user.routingDepartment?.isActive, staffStatus: user.staff?.status }) })
}

const userWithStaff = {
  id: true,
  email: true,
  hashedPassword: true,
  name: true,
  role: true,
  staffId: true,
  isActive: true,
  routingDepartmentId: true,
  routingDepartment: { select: { isActive: true } },
  staff: { select: { status: true } },
} as const

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, staffId, type } = body
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (type === 'credentials') {
      if (!normalizedEmail || typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
      }

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: userWithStaff })
      if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
        return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
      }
      const isValid = await bcrypt.compare(password, user.hashedPassword)
      if (!isValid) return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
      return issueLogin(user)
    }

    if (type === 'staff-credentials' && normalizedEmail) {
      if (!employeeEmailSchema.safeParse(normalizedEmail).success) {
        return NextResponse.json({ error: 'Enter a valid employee email address' }, { status: 400 })
      }
      if (typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
      }
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: userWithStaff })
      if (!user || user.role !== 'STAFF' || !user.staffId || user.staff?.status !== 'Active') {
        return NextResponse.json({ error: 'Invalid employee credentials' }, { status: 401 })
      }
      const isValid = await bcrypt.compare(password, user.hashedPassword)
      if (!isValid) return NextResponse.json({ error: 'Invalid employee credentials' }, { status: 401 })
      return issueLogin(user)
    }

    // Compatibility path for existing staff accounts during migration. New accounts must use email/password.
    if (type === 'staff-credentials') {
      if (!staffId || typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Select a staff member and enter your password' }, { status: 400 })
      }
      const staffIdText = String(staffId).trim()
      if (!/^\d+$/.test(staffIdText)) return NextResponse.json({ error: 'Invalid staff member' }, { status: 400 })
      const sId = Number(staffIdText)
      if (!Number.isSafeInteger(sId) || sId <= 0) return NextResponse.json({ error: 'Invalid staff member' }, { status: 400 })

      const staff = await prisma.staff.findUnique({
        where: { id: sId },
        include: { user: { select: userWithStaff } },
      })
      if (!staff || staff.status !== 'Active' || !staff.user || staff.user.role !== 'STAFF') {
        return NextResponse.json({ error: 'Invalid employee credentials' }, { status: 401 })
      }
      const isValid = await bcrypt.compare(password, staff.user.hashedPassword)
      if (!isValid) return NextResponse.json({ error: 'Invalid employee credentials' }, { status: 401 })
      return issueLogin(staff.user)
    }

    return NextResponse.json({ error: 'Invalid login type' }, { status: 400 })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
