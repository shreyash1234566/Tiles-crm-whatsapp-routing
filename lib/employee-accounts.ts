import { z } from 'zod'

export const employeeEmailSchema = z.string().trim().email('Enter a valid employee email address').max(254)

export function normalizeEmployeeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

const routingPhoneDigitsSchema = z.string().regex(/^\d{10,15}$/, 'Routing phone must contain 10 to 15 digits')

export const routingPhoneSchema = z.string().trim().min(10, 'Routing phone must contain at least 10 digits').max(20, 'Routing phone is too long').transform((value) => {
  const digits = value.replace(/\D/g, '')
  return routingPhoneDigitsSchema.parse(digits)
})

export function normalizeRoutingPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return routingPhoneDigitsSchema.safeParse(digits).success ? digits : null
}

export const ROUTING_DEPARTMENTS = ['Sales', 'Accounts', 'Warehouse', 'Logistics'] as const
export type RoutingDepartmentName = (typeof ROUTING_DEPARTMENTS)[number]

export function getEmployeeHomePath(input: {
  role?: string | null
  staffId?: number | null
  routingDepartmentId?: number | null
  routingDepartmentActive?: boolean
  staffStatus?: string | null
}): '/' | '/routing-crm' | '/staff-portal' {
  if (input.role === 'ADMIN' || input.role === 'MANAGER') return '/'
  if (
    input.role === 'STAFF' &&
    input.staffId &&
    input.staffStatus === 'Active' &&
    input.routingDepartmentId &&
    input.routingDepartmentActive !== false
  ) {
    return '/routing-crm'
  }
  return '/staff-portal'
}
