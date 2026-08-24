import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session) {
      return NextResponse.json(null)
    }

    const userId = session.user.numericId
    const user = Number.isInteger(userId)
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            staffId: true,
            createdAt: true,
            staff: { select: { id: true, name: true, role: true, status: true } },
            routingDepartmentId: true,
            routingDepartment: { select: { id: true, name: true } },
          },
        })
      : null

    if (!user) {
      return NextResponse.json(null)
    }

    // Sync profile to WhatsApp CRM profiles table (non-critical, never crash auth)
    if (user) {
      try {
        await prisma.waProfile.upsert({
          where: { user_id: String(user.id) },
          update: {
            full_name: user.name,
            email: user.email,
            role: user.role,
          },
          create: {
            user_id: String(user.id),
            full_name: user.name,
            email: user.email,
            role: user.role,
          },
        })
      } catch {
        // waProfile sync is optional — don't let it break authentication
      }
    }

    return NextResponse.json({
      user: {
        id: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        staffId: user.staffId,
        jobTitle: user.staff?.role ?? null,
        staffStatus: user.staff?.status ?? null,
        routingDepartmentId: user.routingDepartmentId ?? null,
        routingDepartment: user.routingDepartment ?? null,
        created_at: user.createdAt?.toISOString() ?? null,
      }
    })
  } catch (error) {
    console.error('GET /api/auth/me error:', error)
    return NextResponse.json(null, { status: 500 })
  }
}
