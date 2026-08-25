import { describe, expect, it, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
})
import { prisma } from './db'
import { markNotificationRead, getTopNotifications, markAllAlertNotificationsRead } from '../app/actions/notifications'
import * as authHelpers from './auth-helpers'

vi.mock('./db', () => ({
  prisma: {
    notification: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    followUp: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('./auth-helpers', () => ({
  getSession: vi.fn(),
}))

describe('Notifications logic', () => {
  it('prevents non-admin from modifying global (userId: null) notification', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 1, email: 'user@example.com', name: 'User', role: 'SALES' } 
    } as any)
    
    vi.mocked(prisma.notification.findUnique).mockResolvedValue({ userId: null } as any)
    
    const result = await markNotificationRead(99)
    expect(result).toEqual({ success: false, error: 'Unauthorized - Only Admins can dismiss global alerts' })
    expect(prisma.notification.update).not.toHaveBeenCalled()
  })

  it('allows admin to modify global (userId: null) notification', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 1, email: 'admin@example.com', name: 'Admin', role: 'ADMIN' } 
    } as any)
    
    vi.mocked(prisma.notification.findUnique).mockResolvedValue({ userId: null } as any)
    vi.mocked(prisma.notification.update).mockResolvedValue({} as any)
    
    const result = await markNotificationRead(99)
    expect(result).toEqual({ success: true })
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { read: true }
    })
  })

  it('prevents user from modifying another user\'s notification', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 1, email: 'user@example.com', name: 'User', role: 'SALES' } 
    } as any)
    
    vi.mocked(prisma.notification.findUnique).mockResolvedValue({ userId: 2 } as any) // belongs to user 2
    
    const result = await markNotificationRead(99)
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('allows user to modify their own notification', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 2, email: 'user@example.com', name: 'User', role: 'SALES' } 
    } as any)
    
    vi.mocked(prisma.notification.findUnique).mockResolvedValue({ userId: 2 } as any) // belongs to user 2
    
    const result = await markNotificationRead(99)
    expect(result).toEqual({ success: true })
  })
})

  it('markAll does not dismiss global alerts for non-admin', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 2, email: 'user@example.com', name: 'User', role: 'SALES' } 
    } as any)
    
    await markAllAlertNotificationsRead()
    
    // Check updateMany call
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: { read: false, userId: 2 }
        })
    )
  })

  it('markAll dismisses global alerts for admin', async () => {
    vi.mocked(authHelpers.getSession).mockResolvedValue({ 
      user: { id: 1, email: 'admin@example.com', name: 'Admin', role: 'ADMIN' } 
    } as any)
    
    await markAllAlertNotificationsRead()
    
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: { read: false, OR: [{ userId: null }, { userId: 1 }] }
        })
    )
  })
