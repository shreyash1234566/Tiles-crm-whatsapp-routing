import { z } from 'zod'
import { employeeEmailSchema, routingPhoneSchema } from '@/lib/employee-accounts'

const emailSchema = z.string().email()
const loginUsernameSchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .min(3, 'Login username must be at least 3 characters')
    .max(64, 'Login username must be at most 64 characters')
    .refine((value) => {
      const isEmail = emailSchema.safeParse(value).success
      const isUsername = /^[A-Za-z0-9._-]+$/.test(value)
      return isEmail || isUsername
    }, 'Login username must be a valid email or username'),
])

const permissionRoleSchema = z.enum(['STAFF', 'MANAGER', 'ADMIN'])
const departmentIdSchema = z.union([z.number().int().positive(), z.null()]).optional()
const routingAliasesSchema = z.array(z.string().trim().min(1).max(80)).max(20)

export const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD'),
  loginEmail: employeeEmailSchema.optional(),
  loginUsername: loginUsernameSchema.optional(),
  loginPassword: z.union([z.literal(''), z.string().min(8, 'Password must be at least 8 characters')]).optional(),
  permissionRole: permissionRoleSchema.optional(),
  routingDepartmentId: departmentIdSchema,
  routingPhone: z.union([routingPhoneSchema, z.literal(''), z.null()]).optional(),
  routingAliases: routingAliasesSchema.default([]),
})

export const updateStaffSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email(),
  status: z.enum(['Active', 'Off Duty', 'Inactive']),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD'),
  loginEmail: employeeEmailSchema.optional(),
  loginUsername: loginUsernameSchema.optional(),
  loginPassword: z.union([z.literal(''), z.string().min(8, 'Password must be at least 8 characters')]).optional(),
  permissionRole: permissionRoleSchema.optional(),
  routingDepartmentId: departmentIdSchema,
  routingPhone: z.union([routingPhoneSchema, z.literal(''), z.null()]).optional(),
  routingAliases: routingAliasesSchema.optional(),
})

export const clockInSchema = z.object({
  staffId: z.number(),
  time: z.string(),
})

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
