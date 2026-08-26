'use server'

import { prisma } from '@/lib/db'
import { UserRole } from '@prisma/client'

export interface WidgetLayoutConfig {
  i: string       // widget key
  x: number
  y: number
  w: number
  h: number
}

// 1. Get layout for a user (or fallback to role default, or fallback to system default)
export async function getDashboardLayout(userId: number, role: UserRole): Promise<WidgetLayoutConfig[] | null> {
  // First check if user has custom layout
  const userWidgets = await prisma.dashboardWidget.findMany({
    where: { userId, isVisible: true },
    orderBy: { position: 'asc' }
  })

  if (userWidgets.length > 0) {
    return userWidgets.map(w => ({
      i: w.widgetKey,
      x: (w.config as any)?.x || 0,
      y: (w.config as any)?.y || 0,
      w: (w.config as any)?.w || 3,
      h: (w.config as any)?.h || 4
    }))
  }

  // If no user widgets, check role defaults
  const roleWidgets = await prisma.dashboardWidget.findMany({
    where: { role, userId: null, isVisible: true },
    orderBy: { position: 'asc' }
  })

  if (roleWidgets.length > 0) {
    return roleWidgets.map(w => ({
      i: w.widgetKey,
      x: (w.config as any)?.x || 0,
      y: (w.config as any)?.y || 0,
      w: (w.config as any)?.w || 3,
      h: (w.config as any)?.h || 4
    }))
  }

  return null // Use system defaults client-side
}

// 2. Save user-specific layout
export async function saveDashboardLayout(userId: number, layout: WidgetLayoutConfig[]): Promise<{ success: boolean }> {
  try {
    const existing = await prisma.dashboardWidget.findMany({
      where: { userId }
    })

    const existingKeys = existing.map(w => w.widgetKey)
    const newKeys = layout.map(l => l.i)

    // Delete any widgets that are no longer in the layout
    const toDelete = existingKeys.filter(k => !newKeys.includes(k))
    if (toDelete.length > 0) {
      await prisma.dashboardWidget.deleteMany({
        where: { userId, widgetKey: { in: toDelete } }
      })
    }

    // Upsert the remaining/new
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i]
      await prisma.dashboardWidget.upsert({
        where: {
          userId_widgetKey: { userId, widgetKey: item.i }
        },
        update: {
          position: i,
          config: { x: item.x, y: item.y, w: item.w, h: item.h },
          isVisible: true
        },
        create: {
          userId,
          widgetKey: item.i,
          position: i,
          config: { x: item.x, y: item.y, w: item.w, h: item.h },
          isVisible: true
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to save dashboard layout:', error)
    return { success: false }
  }
}
