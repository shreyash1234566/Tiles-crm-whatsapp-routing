import { z } from 'zod'

export const createCustomOrderSchema = z.object({
  customer: z.string().trim().min(1, 'Customer name is required'),
  phone: z.string().trim().min(10, 'Enter a valid phone number'),
  address: z.string().trim().min(1, 'Site address is required'),
  type: z.string().trim().min(1, 'Select a fabrication or installation type'),
  assignedStaffId: z.number().optional(),
  estimatedDelivery: z.string().optional(),
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  referenceProductId: z.number().optional(),
  referenceImages: z.array(z.string()).optional(),
  materials: z.string().optional(),
  color: z.string().optional(),
  quotedPrice: z.number().int().min(0).optional(),
  advancePaid: z.number().int().min(0).default(0),
  productionNotes: z.string().optional(),
  installationType: z.string().optional(),
  edgeProfile: z.string().optional(),
  cutouts: z.array(z.object({
    type: z.string().min(1),
    count: z.number().int().positive().default(1),
    position: z.string().optional(),
  })).optional(),
  templateMethod: z.enum(['Physical Template', 'Digital/Laser Template', 'Direct Measurement']).optional(),
  areaSqft: z.number().positive('Planned area must be greater than zero').optional(),
  wastagePercent: z.number().min(0).max(100).optional(),
  slabIds: z.array(z.number().int().positive()).optional(),
  // Visit scheduling
  scheduleVisit: z.boolean().optional(),
  visitDate: z.string().optional(),
  visitTime: z.string().optional(),
  visitStaffId: z.number().optional(), // can differ from assignedStaffId
}).superRefine((data, ctx) => {
  if (data.quotedPrice !== undefined && data.advancePaid > data.quotedPrice) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['advancePaid'], message: 'Advance cannot exceed the quoted price' })
  }
  if (data.scheduleVisit && (!data.visitDate || !data.visitTime)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['visitDate'], message: 'Visit date and time are required when scheduling a visit' })
  }
  if (data.scheduleVisit && !data.visitStaffId && !data.assignedStaffId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['visitStaffId'], message: 'Assign a staff member for the scheduled visit' })
  }
})

export const addTimelineEntrySchema = z.object({
  customOrderId: z.number(),
  event: z.string().min(1),
  date: z.string(),
  notes: z.string().optional(),
  status: z.enum(['done', 'pending']).default('pending'),
  updatedBy: z.string().optional(),
})

export const scheduleVisitSchema = z.object({
  customOrderId: z.number(),
  staffId: z.number(),
  date: z.string().min(1, 'Visit date is required'),
  time: z.string().min(1, 'Visit time is required'),
  notes: z.string().optional(),
})

export const updateVisitSchema = z.object({
  visitId: z.number(),
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  staffNotes: z.string().optional(),
  status: z.enum(['Scheduled', 'In Progress', 'Completed', 'Cancelled']).optional(),
  photoUrls: z.array(z.string()).optional(),
})

export const updateMeasurementsSchema = z.object({
  customOrderId: z.number(),
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }),
})

export type CreateCustomOrderInput = z.infer<typeof createCustomOrderSchema>
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>
export type UpdateMeasurementsInput = z.infer<typeof updateMeasurementsSchema>
