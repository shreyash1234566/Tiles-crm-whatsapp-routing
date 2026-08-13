import { z } from 'zod'

export const createWalkinSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  requirement: z.string().min(1),
  roomType: z.string().optional(),
  materialCategory: z.string().optional(),
  applicationArea: z.string().optional(),
  areaSqft: z.number().positive().optional(),
  assignedToId: z.number().optional(),
  budget: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateWalkinInput = z.infer<typeof createWalkinSchema>
