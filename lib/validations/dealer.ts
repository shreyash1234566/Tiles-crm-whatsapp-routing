import { z } from 'zod'

export const dealerStatuses = [
  'PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'CATALOGUE_SHARED',
  'PRICE_LIST_SHARED', 'TRIAL_ORDER', 'ACTIVE', 'DORMANT', 'NOT_INTERESTED', 'LOST',
] as const

export const dealerTaskStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
export const dealerOrderStatuses = [
  'ENQUIRY', 'QUOTATION_SHARED', 'ORDER_RECEIVED', 'APPROVAL_PENDING', 'APPROVED',
  'ALLOCATED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED',
] as const
export const dealerClaimStatuses = ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED'] as const

const optionalText = z.string().trim().optional().or(z.literal(''))
const optionalInt = z.coerce.number().int().min(0).optional()

export const createDealerSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  contactPerson: z.string().trim().min(2, 'Contact person is required'),
  phone: z.string().trim().min(10, 'Valid phone number is required'),
  alternatePhone: optionalText,
  whatsappNumber: optionalText,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  gstNumber: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  territory: optionalText,
  dealerType: z.string().trim().min(2).default('Retailer'),
  status: z.enum(dealerStatuses).default('PROSPECT'),
  preferredCategories: z.array(z.string()).optional().default([]),
  estimatedMonthlyBusiness: optionalInt,
  monthlySalesTarget: optionalInt,
  performanceTier: z.enum(['UNCLASSIFIED', 'A_GRADE', 'B_GRADE', 'C_GRADE', 'HIGH_POTENTIAL', 'LOW_ACTIVITY', 'DORMANT']).optional(),
  creditLimit: optionalInt,
  creditDays: optionalInt,
  paymentTerms: optionalText,
  priceTier: z.string().trim().min(1).default('STANDARD'),
  defaultDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  assignedStaffId: z.coerce.number().int().positive().optional().nullable(),
  source: optionalText,
  nextFollowUpAt: optionalText,
  lostReason: optionalText,
  notes: optionalText,
})

export const updateDealerSchema = createDealerSchema.partial().extend({
  id: z.coerce.number().int().positive(),
})

export const dealerTaskSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  assignedStaffId: z.coerce.number().int().positive().optional().nullable(),
  type: z.string().trim().min(2).default('FOLLOW_UP'),
  title: z.string().trim().min(2, 'Task title is required'),
  description: optionalText,
  dueDate: z.string().min(1, 'Due date is required'),
  reminderAt: optionalText,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  notes: optionalText,
})

export const dealerVisitSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  staffId: z.coerce.number().int().positive().optional().nullable(),
  visitDate: z.string().min(1, 'Visit date is required'),
  purpose: z.string().trim().min(2, 'Visit purpose is required'),
  personMet: optionalText,
  outcome: optionalText,
  nextAction: optionalText,
  nextFollowUpAt: optionalText,
  nextMeetingAt: optionalText,
  samplesShown: optionalText,
  priceListShared: z.coerce.boolean().optional().default(false),
  dealerFeedback: optionalText,
  photoUrls: z.array(z.string().trim().min(1)).optional().default([]),
  documentUrls: z.array(z.string().trim().min(1)).optional().default([]),
  notes: optionalText,
})

export const dealerOrderSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  status: z.enum(dealerOrderStatuses).optional(),
  expectedDispatchDate: optionalText,
  gstPercent: z.coerce.number().min(0).max(100).default(18),
  discount: z.coerce.number().int().min(0).default(0),
  freight: z.coerce.number().int().min(0).default(0),
  loading: z.coerce.number().int().min(0).default(0),
  installation: z.coerce.number().int().min(0).default(0),
  amountPaid: z.coerce.number().int().min(0).default(0),
  salespersonId: z.coerce.number().int().positive().optional().nullable(),
  deliveryAddress: optionalText,
  allocationNotes: optionalText,
  notes: optionalText,
  items: z.array(z.object({
    productId: z.coerce.number().int().positive().optional().nullable(),
    name: optionalText,
    sku: optionalText,
    quantity: z.coerce.number().positive(),
    unitOfMeasure: z.string().trim().min(1).default('PCS'),
    areaSqft: z.coerce.number().positive().optional().nullable(),
    rate: z.coerce.number().int().positive('Dealer rate must be greater than zero'),
    shadeCode: optionalText,
    lotNumber: optionalText,
    notes: optionalText,
  })).min(1, 'Add at least one order item'),
})

export const dealerPaymentSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  dealerOrderId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().int().positive('Payment amount must be greater than zero'),
  method: z.string().trim().min(2).default('Bank Transfer'),
  reference: optionalText,
  paymentDate: z.string().optional(),
  notes: optionalText,
})

export const dealerClaimSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  dealerOrderId: z.coerce.number().int().positive().optional().nullable(),
  assignedStaffId: z.coerce.number().int().positive().optional().nullable(),
  type: z.string().trim().min(2).default('DAMAGE'),
  description: z.string().trim().min(3, 'Claim description is required'),
  quantity: z.coerce.number().positive().optional().nullable(),
  claimAmount: z.coerce.number().int().min(0).default(0),
  replacementStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'DISPATCHED', 'COMPLETED']).optional().default('NOT_REQUIRED'),
  replacementNotes: optionalText,
  notes: optionalText,
})

export const dealerTeamSchema = z.object({
  dealerId: z.coerce.number().int().positive(),
  assignments: z.array(z.object({
    staffId: z.coerce.number().int().positive(),
    role: z.enum(['OWNER', 'SALESPERSON', 'REGIONAL_MANAGER', 'COLLECTION_EXECUTIVE', 'SUPPORT_PERSON']),
  })).max(10),
})

export const dealerPriceListSchema = z.object({
  name: z.string().trim().min(2, 'Price list name is required'),
  dealerId: z.coerce.number().int().positive().optional().nullable(),
  validFrom: z.string().optional(),
  validUntil: optionalText,
  notes: optionalText,
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    rate: z.coerce.number().int().min(0),
    discountPct: z.coerce.number().min(0).max(100).default(0),
    minQuantity: z.coerce.number().min(0).default(0),
    notes: optionalText,
  })).min(1, 'Add at least one product to the price list'),
})
