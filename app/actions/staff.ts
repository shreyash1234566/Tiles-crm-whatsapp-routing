'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createStaffSchema, updateStaffSchema } from '@/lib/validations/staff'
import { requireAuth, requireRole, requireStaffIdentity } from '@/lib/auth-helpers'
import bcrypt from 'bcryptjs'
import type { Prisma, UserRole } from '@prisma/client'
import { employeeEmailSchema, normalizeEmployeeEmail, normalizeRoutingPhone } from '@/lib/employee-accounts'

// ─── IST helpers ─────────────────────────────────────────────────────────────
// All attendance dates/times must be in IST (Asia/Kolkata, UTC+5:30)
// regardless of the server's system timezone.
function getISTDate(): { today: Date; time: string } { 
  const now = new Date()
  // Current IST offset in ms (+5:30 = 19800 s)
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffsetMs)

  // midnight of today in IST, stored as UTC equivalent
  const today = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate())
  )

  // HH:mm in IST (24-hour)
  const hh = String(istNow.getUTCHours()).padStart(2, '0')
  const mm = String(istNow.getUTCMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`

  return { today, time }
}
// ─────────────────────────────────────────────────────────────────────────────

const staffPortalInclude: Prisma.StaffInclude = {
  attendance: { orderBy: { date: 'desc' }, take: 7 },
  activities: { orderBy: { date: 'desc' }, take: 10 },
  fieldVisits: { orderBy: { date: 'desc' }, take: 5 },
  stockUpdates: { orderBy: { date: 'desc' }, take: 5 },
  user: { select: { id: true, email: true, isActive: true, role: true, routingPhone: true, routingAliases: true, routingDepartmentId: true, routingDepartment: { select: { id: true, name: true } } } },
  _count: { select: { leads: true, invoices: true, customOrders: true } },
}

const mapStaffForPortal = (s: any) => ({
  id: s.id,
  name: s.name,
  role: s.role,
  phone: s.phone,
  email: s.email,
  loginEmail: s.user?.email || null,
  loginUsername: s.user?.email || null,
  permissionRole: s.user?.role || 'STAFF',
  hasLogin: !!s.user,
  loginActive: s.user?.isActive ?? false,
  routingDepartmentId: s.user?.routingDepartmentId ?? null,
  routingDepartmentName: s.user?.routingDepartment?.name || null,
  routingPhone: s.user?.routingPhone || null,
  routingAliases: s.user?.routingAliases || [],
  status: s.status,
  joinDate: s.joinDate ? s.joinDate.toISOString().split('T')[0] : null,
  avatar: s.avatar,
  stats: s.stats,
  target: s.target,
  commission: s.commission,
  attendance: s.attendance.map((a: any) => ({
    date: a.date.toISOString().split('T')[0],
    clockIn: a.clockIn,
    clockOut: a.clockOut,
    hours: a.hours,
    status: a.status,
    isLate: a.isLate,
    method: a.method,
    clockInDist: a.clockInDist,
  })),
  activities: s.activities.map((a: any) => ({
    type: a.type,
    text: a.text,
    time: a.time,
    date: a.date.toISOString().split('T')[0],
  })),
  fieldVisits: s.fieldVisits.map((fv: any) => ({
    id: fv.displayId,
    customer: fv.customer,
    address: fv.address,
    date: fv.date.toISOString().split('T')[0],
    time: fv.time,
    status: fv.status,
    type: fv.type,
    notes: fv.notes,
    measurements: fv.measurements,
    photos: fv.photos,
  })),
  stockUpdates: s.stockUpdates.map((su: any) => ({
    product: su.product,
    warehouse: su.warehouse,
    action: su.action,
    qty: su.quantity,
    date: su.date.toISOString().split('T')[0],
    time: su.time,
  })),
})

export async function getStaff() {
  try { await requireAuth() } catch { return { success: false, error: 'Unauthorized', data: [] } }
  const staff = await prisma.staff.findMany({
    include: staffPortalInclude,
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: staff.map(mapStaffForPortal),
  }
}

export async function getStaffPortalProfile(staffId: number) {
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden' } }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: staffPortalInclude,
  })

  if (!staff) return { success: false, error: 'Staff not found' }

  return { success: true, data: mapStaffForPortal(staff) }
}

export async function getStaffMember(id: number) {
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      attendance: { orderBy: { date: 'desc' } },
      activities: { orderBy: { date: 'desc' } },
      fieldVisits: { orderBy: { date: 'desc' } },
      stockUpdates: { orderBy: { date: 'desc' } },
    },
  })
  if (!staff) return { success: false, error: 'Staff not found' }
  return { success: true, data: staff }
}

export async function createStaff(data: unknown) {
  let session
  try { session = await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const parsed = createStaffSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const permissionRole = parsed.data.permissionRole ?? 'STAFF'
  if (permissionRole !== 'STAFF' && session.user.role !== 'ADMIN') {
    return { success: false, error: 'Only an admin can assign Manager or Admin permissions' }
  }

  const loginEmail = parsed.data.loginEmail?.trim().toLowerCase() || parsed.data.loginUsername?.trim().toLowerCase() || undefined
  const loginPassword = parsed.data.loginPassword || ''
  if ((loginEmail && !loginPassword) || (!loginEmail && loginPassword)) {
    return { success: false, error: 'Provide both employee email and password, or leave both empty' }
  }
  if (permissionRole !== 'STAFF' && !loginEmail) {
    return { success: false, error: 'Manager and Admin profiles require an employee login account' }
  }
  if (loginEmail && !employeeEmailSchema.safeParse(loginEmail).success) {
    return { success: false, error: 'New employee login must use a valid email address' }
  }

  const routingDepartmentId = parsed.data.routingDepartmentId ?? null
  const routingPhone = normalizeRoutingPhone(parsed.data.routingPhone)
  const routingAliases = parsed.data.routingAliases || []
  if (parsed.data.routingPhone && !routingPhone) {
    return { success: false, error: 'Routing phone must contain 8 to 15 digits' }
  }
  if (routingDepartmentId !== null && !loginEmail) {
    return { success: false, error: 'A routing department requires an employee login account' }
  }
  if (routingDepartmentId !== null && !routingPhone) {
    return { success: false, error: 'A routing department requires an authorized routing phone' }
  }
  if (routingDepartmentId === null && (routingPhone || routingAliases.length > 0)) {
    return { success: false, error: 'Choose a routing department before configuring a routing recipient' }
  }
  const [existingStaff, existingUser, existingRoutingUser] = await Promise.all([
    prisma.staff.findUnique({ where: { email: normalizeEmployeeEmail(parsed.data.email) }, select: { id: true } }),
    loginEmail ? prisma.user.findUnique({ where: { email: loginEmail }, select: { id: true } }) : null,
    routingPhone ? prisma.user.findUnique({ where: { routingPhone }, select: { id: true } }) : null,
  ])
  if (existingStaff) return { success: false, error: 'Staff email is already in use' }
  if (existingUser) return { success: false, error: 'Employee login email is already in use' }
  if (existingRoutingUser) return { success: false, error: 'Routing phone is already assigned to another user' }

  const normalizedStaffEmail = normalizeEmployeeEmail(parsed.data.email)
  const staff = await prisma.$transaction(async tx => {
    const department = routingDepartmentId === null
      ? null
      : await tx.routingDepartment.findUnique({ where: { id: routingDepartmentId }, select: { id: true, isActive: true } })
    if (routingDepartmentId !== null && !department?.isActive) throw new Error('Routing department not found or inactive')

    const createdStaff = await tx.staff.create({
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
        phone: parsed.data.phone,
        email: normalizedStaffEmail,
        joinDate: new Date(parsed.data.joinDate),
        avatar: parsed.data.name.split(' ').map(n => n[0]).join('').toUpperCase(),
        stats: { leadsAssigned: 0, conversions: 0, revenue: 0, avgResponseTime: '0 min', todaySales: 0, todayRevenue: 0, rating: 0, conversionRate: 0 },
        target: { monthly: 0, achieved: 0 },
        commission: { rate: 0, earned: 0 },
      },
    })

    if (loginEmail && loginPassword) {
      const hashedPassword = await bcrypt.hash(loginPassword, 12)
      await tx.user.create({
        data: {
          email: loginEmail,
          name: parsed.data.name,
          hashedPassword,
          role: permissionRole as UserRole,
          staffId: createdStaff.id,
          routingDepartmentId,
          routingPhone: routingDepartmentId ? routingPhone : null,
          routingAliases: routingDepartmentId ? routingAliases : [],
        },
      })
    }

    return createdStaff
  })

  revalidatePath('/staff')
  revalidatePath('/settings')
  revalidatePath('/routing-crm')
  return { success: true, data: staff }
}

export async function assignStaffLogin(staffId: number, loginEmail: string, loginPassword: string) {
  let session
  try { session = await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }

  const email = loginEmail.trim().toLowerCase()
  const password = loginPassword
  if (!employeeEmailSchema.safeParse(email).success) return { success: false, error: 'Employee login must use a valid email address' }
  if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters' }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { id: true } } },
  })
  if (!staff) return { success: false, error: 'Staff not found' }
  if (staff.user) return { success: false, error: 'This team member already has login credentials' }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) return { success: false, error: 'Employee email is already in use' }

  const hashedPassword = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: {
      email,
      name: staff.name,
      hashedPassword,
      role: 'STAFF' as UserRole,
      staffId: staff.id,
    },
  })

  revalidatePath('/staff')
  revalidatePath('/settings')
  return { success: true, managerRole: session.user.role }
}

export async function updateStaffMember(data: unknown) {
  let session
  try { session = await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }

  const parsed = updateStaffSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.staff.findUnique({
    where: { id: parsed.data.id },
    include: { user: { select: { id: true, email: true, role: true, routingDepartmentId: true, routingPhone: true, routingAliases: true } } },
  })
  if (!existing) return { success: false, error: 'Staff not found' }

  const suppliedLoginEmail = parsed.data.loginEmail?.trim().toLowerCase() || parsed.data.loginUsername?.trim().toLowerCase() || undefined
  const loginEmail = suppliedLoginEmail || existing.user?.email || undefined
  const loginPassword = parsed.data.loginPassword || ''
  const routingDepartmentId = parsed.data.routingDepartmentId === undefined ? (existing.user?.routingDepartmentId ?? null) : parsed.data.routingDepartmentId
  const routingPhoneInput = parsed.data.routingPhone === undefined ? existing.user?.routingPhone : parsed.data.routingPhone
  const routingPhone = normalizeRoutingPhone(routingPhoneInput)
  const routingAliases = parsed.data.routingAliases === undefined ? (existing.user?.routingAliases || []) : parsed.data.routingAliases
  if (routingPhoneInput && !routingPhone) {
    return { success: false, error: 'Routing phone must contain 8 to 15 digits' }
  }
  const permissionRole = parsed.data.permissionRole ?? existing.user?.role ?? 'STAFF'

  if (!existing.user && loginPassword && !loginEmail) {
    return { success: false, error: 'Provide employee email to create credentials' }
  }
  if (!existing.user && ((loginEmail && !loginPassword) || (!loginEmail && loginPassword))) {
    return { success: false, error: 'Provide both employee email and password to create login' }
  }
  if (existing.user && loginPassword && !loginEmail) {
    return { success: false, error: 'Employee email is required when updating password' }
  }
  if (permissionRole !== 'STAFF' && session.user.role !== 'ADMIN') {
    return { success: false, error: 'Only an admin can assign Manager or Admin permissions' }
  }
  if (routingDepartmentId !== null && !loginEmail) {
    return { success: false, error: 'A routing department requires an employee login account' }
  }
  if (routingDepartmentId !== null && !routingPhone) {
    return { success: false, error: 'A routing department requires an authorized routing phone' }
  }
  if (routingDepartmentId === null && (routingPhone || routingAliases.length > 0)) {
    return { success: false, error: 'Choose a routing department before configuring a routing recipient' }
  }
  if (suppliedLoginEmail && suppliedLoginEmail !== existing.user?.email && !employeeEmailSchema.safeParse(suppliedLoginEmail).success) {
    return { success: false, error: 'Employee login must use a valid email address' }
  }
  if (!existing.user && permissionRole !== 'STAFF') {
    return { success: false, error: 'Create the employee login before assigning a Manager or Admin permission role' }
  }
  const usedStaffEmail = await prisma.staff.findUnique({ where: { email: normalizeEmployeeEmail(parsed.data.email) }, select: { id: true } })
  if (usedStaffEmail && usedStaffEmail.id !== existing.id) return { success: false, error: 'Staff email is already in use' }
  if (suppliedLoginEmail && suppliedLoginEmail !== existing.user?.email) {
    const usedUser = await prisma.user.findUnique({ where: { email: suppliedLoginEmail }, select: { id: true } })
    if (usedUser && usedUser.id !== existing.user?.id) return { success: false, error: 'Employee login email is already in use' }
  }
  if (routingPhone && routingPhone !== existing.user?.routingPhone) {
    const usedRoutingUser = await prisma.user.findUnique({ where: { routingPhone }, select: { id: true } })
    if (usedRoutingUser && usedRoutingUser.id !== existing.user?.id) return { success: false, error: 'Routing phone is already assigned to another user' }
  }

  await prisma.$transaction(async tx => {
    const department = routingDepartmentId === null
      ? null
      : await tx.routingDepartment.findUnique({ where: { id: routingDepartmentId }, select: { id: true, isActive: true } })
    if (routingDepartmentId !== null && !department?.isActive) throw new Error('Routing department not found or inactive')

    await tx.staff.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
        phone: parsed.data.phone,
        email: normalizeEmployeeEmail(parsed.data.email),
        status: parsed.data.status,
        joinDate: new Date(parsed.data.joinDate),
      },
    })

    if (existing.user) {
      const userData: { name: string; email?: string; hashedPassword?: string; role: UserRole; routingDepartmentId: number | null; routingPhone: string | null; routingAliases: string[] } = {
        name: parsed.data.name,
        role: permissionRole as UserRole,
        routingDepartmentId,
        routingPhone: routingDepartmentId ? routingPhone : null,
        routingAliases: routingDepartmentId ? routingAliases : [],
      }
      if (loginEmail) userData.email = loginEmail
      if (loginPassword) userData.hashedPassword = await bcrypt.hash(loginPassword, 12)
      await tx.user.update({ where: { id: existing.user.id }, data: userData })
    } else if (loginEmail && loginPassword) {
      await tx.user.create({
        data: {
          email: loginEmail,
          name: parsed.data.name,
          hashedPassword: await bcrypt.hash(loginPassword, 12),
          role: permissionRole as UserRole,
          staffId: parsed.data.id,
          routingDepartmentId,
          routingPhone: routingDepartmentId ? routingPhone : null,
          routingAliases: routingDepartmentId ? routingAliases : [],
        },
      })
    }
  })

  revalidatePath('/staff')
  revalidatePath('/settings')
  revalidatePath('/staff-portal')
  revalidatePath('/routing-crm')

  return { success: true }
}

export async function updateStaffTarget(staffId: number, data: {
  monthlyTarget: number
  achieved: number
  commissionRate: number
  commissionEarned: number
  commissionPending: number
}) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }

  const staff = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staff) return { success: false, error: 'Staff not found' }

  await prisma.staff.update({
    where: { id: staffId },
    data: {
      target: { monthly: data.monthlyTarget, achieved: data.achieved },
      commission: { rate: data.commissionRate, earned: data.commissionEarned, pending: data.commissionPending },
    },
  })

  revalidatePath('/staff')
  return { success: true }
}

// Haversine distance in meters
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function clockIn(staffId: number, gps?: { lat: number; lng: number }) {
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden' } }
  const { today, time } = getISTDate()

  // 1. Check if already clocked in
  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId, date: today } }
  })

  if (existing?.clockIn) {
    return { success: false, error: 'Already clocked in for today' }
  }

  // Fetch settings once for both geofence and shift-time checks
  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })

  // 2. Check geofence if GPS provided
  let distance: number | null = null
  let method = 'manual'
  if (gps) {
    method = 'gps'
    if (settings?.storeLat && settings?.storeLng) {
      distance = Math.round(getDistance(gps.lat, gps.lng, settings.storeLat, settings.storeLng))
      if (distance > (settings.geofenceRadius ?? 100)) {
        return { success: false, error: `You are ${distance}m away from the store. Must be within ${settings.geofenceRadius ?? 100}m to clock in.` }
      }
    }
  }

  // 3. Check if late (compare IST clock time vs configured shift start)
  // Standard ERP feature: Add a 15-minute grace period
  const shiftStart = settings?.shiftStartTime || '09:30'
  const [shiftH, shiftM] = shiftStart.split(':').map(Number)
  const [nowH, nowM] = time.split(':').map(Number)
  
  const graceMinutes = 15
  const isLate = (nowH * 60 + nowM) > (shiftH * 60 + shiftM + graceMinutes)

  const attendance = await prisma.attendance.upsert({
    where: { staffId_date: { staffId, date: today } },
    create: {
      staffId, date: today, clockIn: time, status: isLate ? 'Late' : 'Present',
      clockInLat: gps?.lat, clockInLng: gps?.lng, clockInDist: distance, method, isLate,
    },
    update: {
      clockIn: time, status: isLate ? 'Late' : 'Present',
      clockInLat: gps?.lat, clockInLng: gps?.lng, clockInDist: distance, method, isLate,
    },
  })

  revalidatePath('/staff')
  revalidatePath('/staff-portal')
  return { success: true, data: { ...attendance, isLate, distance } }
}

export async function clockOut(staffId: number, gps?: { lat: number; lng: number }) {
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden' } }
  const { today, time } = getISTDate()

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId, date: today } },
  })

  if (!existing || !existing.clockIn) {
    return { success: false, error: 'Must clock in first' }
  }
  
  if (existing.clockOut) {
    return { success: false, error: 'Already clocked out for today' }
  }

  // Check geofence if GPS provided (informational only on clock-out)
  let distance: number | null = null
  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })
  if (gps) {
    if (settings?.storeLat && settings?.storeLng) {
      distance = Math.round(getDistance(gps.lat, gps.lng, settings.storeLat, settings.storeLng))
    }
  }

  // Calculate hours worked (guard against midnight crossover giving negative)
  const [inH, inM] = existing.clockIn.split(':').map(Number)
  const [outH, outM] = time.split(':').map(Number)
  let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
  if (totalMins < 0) totalMins += 24 * 60 // midnight crossover
  const hours = Math.round(totalMins / 60 * 100) / 100
  
  // Standard ERP feature: Check for Half Day based on shift duration
  const shiftStart = settings?.shiftStartTime || '09:30'
  const shiftEnd = settings?.shiftEndTime || '20:00'
  const [startH, startM] = shiftStart.split(':').map(Number)
  const [endH, endM] = shiftEnd.split(':').map(Number)
  
  let shiftTotalMins = (endH * 60 + endM) - (startH * 60 + startM)
  if (shiftTotalMins <= 0) shiftTotalMins = 9 * 60 // fallback to 9 hours if configured incorrectly
  const halfDayThresholdHours = (shiftTotalMins / 2) / 60
  
  let newStatus = existing.status
  // If they worked less than half the shift, automatically mark as Half Day
  if (hours > 0 && hours < halfDayThresholdHours) {
    newStatus = 'Half Day'
  }

  const attendance = await prisma.attendance.update({
    where: { staffId_date: { staffId, date: today } },
    data: { clockOut: time, hours, status: newStatus, clockOutLat: gps?.lat, clockOutLng: gps?.lng, clockOutDist: distance },
  })

  revalidatePath('/staff')
  revalidatePath('/staff-portal')
  return { success: true, data: attendance }
}

export async function getMonthAttendance(staffId: number, year: number, month: number) {
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden', data: [] } }
  // month is 1-based (1 = January)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59) // last day of month

  const records = await prisma.attendance.findMany({
    where: { staffId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  })

  return {
    success: true,
    data: records.map(a => ({
      date: a.date.toISOString().split('T')[0],
      clockIn: a.clockIn,
      clockOut: a.clockOut,
      hours: a.hours,
      status: a.status,
      isLate: a.isLate,
      method: a.method,
      clockInDist: a.clockInDist,
    })),
  }
}

export async function getAttendance(staffId: number, days: number = 30) {
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden', data: [] } }
  const since = new Date()
  since.setDate(since.getDate() - days)

  const attendance = await prisma.attendance.findMany({
    where: { staffId, date: { gte: since } },
    orderBy: { date: 'desc' },
  })

  return { success: true, data: attendance }
}

export async function getDailyAttendanceReport() {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const { today } = getISTDate()

  const allStaff = await prisma.staff.findMany({
    where: { status: 'Active' },
    select: { id: true, name: true, role: true, avatar: true, phone: true },
  })

  const todayRecords = await prisma.attendance.findMany({
    where: { date: today },
    include: { staff: { select: { name: true, role: true, avatar: true } } },
  })

  const recordMap = new Map(todayRecords.map(r => [r.staffId, r]))

  const report = allStaff.map(s => {
    const record = recordMap.get(s.id)
    return {
      staffId: s.id,
      name: s.name,
      role: s.role,
      avatar: s.avatar,
      status: record?.status || 'Absent',
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      hours: record?.hours || null,
      isLate: record?.isLate || false,
      method: record?.method || null,
      distance: record?.clockInDist || null,
    }
  })

  const present = report.filter(r => r.status === 'Present' || r.status === 'Late').length
  const late = report.filter(r => r.isLate).length
  const absent = report.filter(r => r.status === 'Absent').length

  return { success: true, data: { report, summary: { total: allStaff.length, present, late, absent } } }
}

export async function staffStockUpdate(data: {
  staffId: number
  productId: number
  action: string
  quantity: number
}) {
  const { staffId, productId, action, quantity } = data
  try { await requireStaffIdentity(staffId) } catch { return { success: false, error: 'Forbidden' } }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { warehouse: true },
  })
  if (!product) return { success: false, error: 'Product not found' }

  // Determine stock delta
  let delta = 0
  if (action === 'Received') delta = quantity
  else if (action === 'Stock Out' || action === 'Dispatched') delta = -quantity

  const newStock = product.stock + delta
  if (newStock < 0) return { success: false, error: `Cannot reduce stock below 0. Current stock: ${product.stock}` }

  const now = new Date()
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

  // Update product stock (skip for Low Stock Alert — it's informational)
  if (delta !== 0) {
    await prisma.product.update({
      where: { id: productId },
      data: {
        stock: { increment: delta },
        ...(action === 'Received' ? { lastRestocked: now } : {}),
      },
    })
  }

  // Log the stock update
  await prisma.stockUpdate.create({
    data: {
      staffId,
      product: product.name,
      warehouse: product.warehouse?.name || 'Unassigned',
      action,
      quantity,
      date: now,
      time,
    },
  })

  revalidatePath('/inventory')
  revalidatePath('/staff-portal')
  revalidatePath('/staff')

  return {
    success: true,
    data: {
      productName: product.name,
      previousStock: product.stock,
      newStock: delta !== 0 ? newStock : product.stock,
      action,
      quantity,
    },
  }
}
