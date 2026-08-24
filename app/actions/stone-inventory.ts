'use server'

import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { syncStoneLotTotals } from '@/lib/stone-inventory'

const slabStatus = z.enum(['AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED', 'IN_PROCESSING'])

const createLotSchema = z.object({
  lotNumber: z.string().trim().min(1, 'Lot number is required'),
  productId: z.number().int().positive(),
  supplierId: z.number().int().positive().optional(),
  godownId: z.number().int().positive().optional(),
  origin: z.string().trim().optional(),
  shadeCode: z.string().trim().optional(),
  qualityGrade: z.string().trim().optional(),
  avgThicknessMm: z.number().positive().optional(),
  costPerSqft: z.number().min(0).default(0),
  notes: z.string().trim().optional(),
  photos: z.array(z.string()).default([]),
  slabs: z.array(z.object({
    slabNumber: z.string().trim().min(1),
    lengthInches: z.number().positive(),
    widthInches: z.number().positive(),
    thicknessMm: z.number().positive().optional(),
    photo: z.string().optional(),
    qcGrade: z.string().optional(),
  })).min(1, 'Add at least one slab').superRefine((slabs, ctx) => {
    const seen = new Set<string>()
    slabs.forEach((slab, index) => {
      const key = slab.slabNumber.toLowerCase()
      if (seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'slabNumber'], message: `Duplicate slab number: ${slab.slabNumber}` })
      }
      seen.add(key)
    })
  }),
})

const updateSlabSchema = z.object({
  slabId: z.number().int().positive(),
  status: slabStatus.optional(),
  godownId: z.number().int().positive().nullable().optional(),
  qcGrade: z.string().trim().nullable().optional(),
  photo: z.string().trim().nullable().optional(),
  reservedForCustomId: z.number().int().positive().nullable().optional(),
  soldPrice: z.number().min(0).nullable().optional(),
})

const sampleLoanSchema = z.object({
  contactId: z.number().int().positive().optional(),
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().min(10).optional(),
  productId: z.number().int().positive().optional(),
  slabId: z.number().int().positive().optional(),
  expectedReturn: z.string().optional(),
  notes: z.string().trim().optional(),
}).refine(data => data.contactId || (data.customerName && data.customerPhone), { message: 'Select or enter the customer receiving the sample' })
  .refine(data => data.productId || data.slabId, { message: 'Select a product or slab sample' })

const sampleLoanStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['RETURNED', 'LOST', 'CONVERTED_TO_SALE']),
})

const bookMatchSchema = z.object({
  slabId: z.number().int().positive(),
  partnerId: z.number().int().positive().nullable(),
})

const sqft = (lengthInches: number, widthInches: number) =>
  Math.round((lengthInches * widthInches / 144) * 100) / 100

const stoneOffcutSchema = z.object({
  sourceSlabId: z.number().int().positive(),
  sourceCustomOrderId: z.number().int().positive().optional(),
  lengthInches: z.number().positive(),
  widthInches: z.number().positive(),
  shadeCode: z.string().trim().optional(),
  photo: z.string().trim().optional(),
  salePrice: z.number().int().min(0).optional(),
  notes: z.string().trim().optional(),
})

export async function getStoneLots(filters?: { query?: string; status?: string; godownId?: number }) {
  const query = filters?.query?.trim()
  const lots = await prisma.stoneLot.findMany({
    where: {
      ...(filters?.status && filters.status !== 'ALL' ? { status: filters.status } : {}),
      ...(query ? {
        OR: [
          { lotNumber: { contains: query, mode: 'insensitive' } },
          { shadeCode: { contains: query, mode: 'insensitive' } },
          { product: { name: { contains: query, mode: 'insensitive' } } },
        ],
      } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true, price: true, hsnCode: true, materialCategory: true, thicknessMm: true, finish: true } },
      supplier: { select: { id: true, name: true } },
      slabs: {
        where: filters?.godownId ? { godownId: filters.godownId } : undefined,
        include: { godown: { select: { id: true, name: true } }, reservedForCustom: { select: { displayId: true } } },
        orderBy: { slabNumber: 'asc' },
      },
    },
    orderBy: { purchaseDate: 'desc' },
  })

  return {
    success: true,
    data: lots.map(lot => ({
      ...lot,
      availableSlabs: lot.slabs.filter(s => s.status === 'AVAILABLE').length,
      availableSqft: Math.round(lot.slabs.filter(s => s.status === 'AVAILABLE').reduce((sum, slab) => sum + slab.sqft, 0) * 100) / 100,
      reservedSlabs: lot.slabs.filter(s => s.status === 'RESERVED' || s.status === 'IN_PROCESSING').length,
    })),
  }
}

export async function createStoneLot(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createLotSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const input = parsed.data
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { isSlabTracked: true, thicknessMm: true } })
  if (!product) return { success: false, error: 'Stone product not found' }
  if (!product.isSlabTracked) return { success: false, error: 'Enable slab tracking on the selected product first' }
  if (input.godownId) {
    const godown = await prisma.godown.findUnique({ where: { id: input.godownId }, select: { id: true } })
    if (!godown) return { success: false, error: 'Selected stone yard / godown was not found' }
  }
  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } })
    if (!supplier) return { success: false, error: 'Selected supplier was not found' }
  }

  try {
    const lot = await prisma.$transaction(async tx => {
      const created = await tx.stoneLot.create({
        data: {
          lotNumber: input.lotNumber,
          productId: input.productId,
          supplierId: input.supplierId,
          origin: input.origin || null,
          shadeCode: input.shadeCode || null,
          qualityGrade: input.qualityGrade || null,
          avgThicknessMm: input.avgThicknessMm ?? product.thicknessMm ?? null,
          costPerSqft: input.costPerSqft,
          notes: input.notes || null,
          photos: input.photos,
          slabs: {
            create: input.slabs.map(slab => ({
              slabNumber: slab.slabNumber,
              lengthInches: slab.lengthInches,
              widthInches: slab.widthInches,
              sqft: sqft(slab.lengthInches, slab.widthInches),
              thicknessMm: slab.thicknessMm ?? product.thicknessMm ?? null,
              photo: slab.photo || null,
              qcGrade: slab.qcGrade || null,
              godownId: input.godownId,
            })),
          },
        },
      })
      await syncStoneLotTotals(tx, created.id)
      return created
    })
    revalidatePath('/inventory')
    return { success: true, data: lot }
  } catch (error: any) {
    if (error?.code === 'P2002') return { success: false, error: 'That lot number or slab number already exists' }
    if (error?.code === 'P2003') return { success: false, error: 'A selected inventory relation no longer exists. Refresh and try again.' }
    return { success: false, error: error?.message || 'Could not create stone lot' }
  }
}

export async function updateSlab(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateSlabSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const input = parsed.data

  const slab = await prisma.slab.findUnique({
    where: { id: input.slabId },
    select: {
      id: true,
      lotId: true,
      status: true,
      godownId: true,
      reservedForCustomId: true,
      sampleLoans: { where: { status: 'OUT' }, select: { id: true }, take: 1 },
    },
  })
  if (!slab) return { success: false, error: 'Slab not found' }
  if (input.status === 'SOLD') return { success: false, error: 'Mark a slab sold only through the invoice or fabrication delivery workflow' }

  const nextStatus = input.status ?? slab.status
  const statusChanged = input.status !== undefined && input.status !== slab.status
  if (slab.sampleLoans.length > 0 && statusChanged && nextStatus !== 'RESERVED') {
    return { success: false, error: 'Close the active sample loan before changing this slab status' }
  }
  if (slab.status === 'SOLD' && statusChanged) return { success: false, error: 'Sold slabs cannot be reopened from the inventory screen' }
  if (slab.status === 'DAMAGED' && statusChanged && nextStatus !== 'DAMAGED') {
    return { success: false, error: 'Damaged slabs cannot be reopened without a new QC workflow' }
  }
  if (['RESERVED', 'IN_PROCESSING'].includes(nextStatus) && !input.reservedForCustomId && !slab.reservedForCustomId && slab.sampleLoans.length === 0) {
    return { success: false, error: 'Allocate a slab through a fabrication job or issue it as a sample' }
  }
  if (slab.reservedForCustomId && statusChanged && nextStatus !== slab.status && !input.reservedForCustomId) {
    return { success: false, error: 'This slab is allocated to a fabrication job. Use that job to move or release it.' }
  }
  if (input.godownId !== undefined && input.godownId !== slab.godownId && ['RESERVED', 'IN_PROCESSING', 'SOLD'].includes(slab.status)) {
    return { success: false, error: 'Allocated or sold slabs cannot be moved from the inventory screen' }
  }
  if (input.reservedForCustomId && nextStatus !== 'RESERVED' && nextStatus !== 'IN_PROCESSING') {
    return { success: false, error: 'A fabrication allocation can only be attached to a reserved or in-process slab' }
  }
  if (input.reservedForCustomId) {
    const customOrder = await prisma.customOrder.findUnique({ where: { id: input.reservedForCustomId }, select: { id: true } })
    if (!customOrder) return { success: false, error: 'Fabrication job not found' }
  }

  const updated = await prisma.$transaction(async tx => {
    const next = await tx.slab.update({
      where: { id: slab.id },
      data: {
        ...(input.status ? { status: input.status, soldAt: input.status === 'SOLD' ? new Date() : undefined } : {}),
        ...(input.godownId !== undefined ? { godownId: input.godownId } : {}),
        ...(input.qcGrade !== undefined ? { qcGrade: input.qcGrade } : {}),
        ...(input.photo !== undefined ? { photo: input.photo } : {}),
        ...(input.reservedForCustomId !== undefined ? { reservedForCustomId: input.reservedForCustomId } : {}),
        ...(input.soldPrice !== undefined ? { soldPrice: input.soldPrice } : {}),
        ...(statusChanged && nextStatus !== 'RESERVED' && nextStatus !== 'IN_PROCESSING' ? { reservedForCustomId: null } : {}),
      },
    })
    await syncStoneLotTotals(tx, slab.lotId)
    return next
  })
  revalidatePath('/inventory')
  revalidatePath('/custom-orders')
  return { success: true, data: updated }
}

export async function createStoneOffcut(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = stoneOffcutSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const input = parsed.data
  const areaSqft = sqft(input.lengthInches, input.widthInches)
  let offcut
  try {
    offcut = await prisma.$transaction(async tx => {
    const source = await tx.slab.findUnique({
      where: { id: input.sourceSlabId },
      select: {
        id: true,
        lotId: true,
        sqft: true,
        status: true,
        reservedForCustomId: true,
        photo: true,
        lot: { select: { productId: true, costPerSqft: true, shadeCode: true } },
      },
    })
    if (!source) throw new Error('Source slab not found')
    if (!['IN_PROCESSING', 'SOLD'].includes(source.status)) {
      throw new Error('Only a slab being fabricated or already sold can produce an offcut')
    }
    if (source.reservedForCustomId && input.sourceCustomOrderId !== source.reservedForCustomId) {
      throw new Error('This slab belongs to a fabrication job. Record its offcut from that job so dimensions stay linked.')
    }
    if (input.sourceCustomOrderId) {
      const customOrder = await tx.customOrder.findUnique({ where: { id: input.sourceCustomOrderId }, select: { id: true } })
      if (!customOrder) throw new Error('Fabrication job not found')
    }
    if (areaSqft > source.sqft + 0.01) {
      throw new Error('Offcut dimensions cannot exceed the source slab area')
    }

    const existingOffcuts = await tx.scrapInventory.findMany({
      where: { sourceSlabId: source.id },
      select: { areaSqft: true },
    })
    const recordedArea = existingOffcuts.reduce((sum, entry) => sum + (entry.areaSqft || 0), 0)
    if (recordedArea + areaSqft > source.sqft + 0.01) {
      throw new Error(`This slab has only ${(Math.max(0, source.sqft - recordedArea)).toFixed(2)} sq.ft left for offcuts`)
    }

    const unitCost = source.lot.costPerSqft || 0
    const estimatedValue = input.salePrice ?? Math.round(areaSqft * unitCost)
    return tx.scrapInventory.create({
      data: {
        rawMaterialId: source.lot.productId,
        sourceSlabId: source.id,
        sourceCustomOrderId: input.sourceCustomOrderId,
        lengthInches: input.lengthInches,
        widthInches: input.widthInches,
        areaSqft,
        shadeCode: input.shadeCode || source.lot.shadeCode || null,
        photo: input.photo || source.photo || null,
        salePrice: input.salePrice ?? null,
        quantity: areaSqft,
        unitOfMeasure: 'SQFT',
        unitCost,
        estimatedValue,
        reason: 'Stone fabrication offcut',
        disposition: 'REUSABLE',
        status: 'IN_STOCK',
        notes: input.notes || null,
      },
    })
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not record stone offcut' }
  }
  revalidatePath('/manufacturing')
  return { success: true, data: offcut }
}

export async function pairSlabs(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = bookMatchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { slabId, partnerId } = parsed.data
  const slab = await prisma.slab.findUnique({ where: { id: slabId }, select: { lotId: true, bookMatchPairId: true, status: true } })
  if (!slab) return { success: false, error: 'Slab not found' }
  if (['SOLD', 'DAMAGED', 'RESERVED', 'IN_PROCESSING'].includes(slab.status)) return { success: false, error: 'Only available slabs can be paired or unpaired' }
  if (partnerId === slabId) return { success: false, error: 'A slab cannot be paired with itself' }
  if (partnerId) {
    const partner = await prisma.slab.findUnique({ where: { id: partnerId }, select: { lotId: true, bookMatchPairId: true, status: true } })
    if (!partner || partner.lotId !== slab.lotId) return { success: false, error: 'Book-match slabs must come from the same lot' }
    if (['SOLD', 'DAMAGED', 'RESERVED', 'IN_PROCESSING'].includes(partner.status)) return { success: false, error: 'Only available slabs can be paired' }
  }
  await prisma.$transaction(async tx => {
    if (partnerId) {
      const partner = await tx.slab.findUnique({ where: { id: partnerId }, select: { bookMatchPairId: true } })
      if (partner?.bookMatchPairId && partner.bookMatchPairId !== slabId) {
        await tx.slab.update({ where: { id: partner.bookMatchPairId }, data: { bookMatchPairId: null } })
      }
    }
    if (slab.bookMatchPairId && slab.bookMatchPairId !== partnerId) {
      await tx.slab.update({ where: { id: slab.bookMatchPairId }, data: { bookMatchPairId: null } })
    }
    await tx.slab.update({ where: { id: slabId }, data: { bookMatchPairId: partnerId } })
    if (partnerId) await tx.slab.update({ where: { id: partnerId }, data: { bookMatchPairId: slabId } })
  })
  revalidatePath('/inventory')
  return { success: true }
}

export async function getSampleLoans() {
  const loans = await prisma.sampleLoan.findMany({
    include: {
      contact: { select: { name: true, phone: true } },
      product: { select: { name: true, sku: true } },
      slab: { select: { slabNumber: true, sqft: true, lot: { select: { lotNumber: true } } } },
    },
    orderBy: { checkoutDate: 'desc' },
  })
  return { success: true, data: loans }
}

export async function createSampleLoan(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  const parsed = sampleLoanSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const input = parsed.data

  let contactId = input.contactId
  if (!contactId) {
    const contact = await prisma.contact.findFirst({ where: { phone: input.customerPhone } })
    contactId = contact?.id || (await prisma.contact.create({
      data: { name: input.customerName!, phone: input.customerPhone! },
      select: { id: true },
    })).id
  }

  let sampleProductId = input.productId
  if (input.productId) {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true, isSlabTracked: true } })
    if (!product) return { success: false, error: 'Product not found' }
    if (product.isSlabTracked && !input.slabId) return { success: false, error: 'Select a physical slab when issuing a sample for slab-tracked stone' }
  }

  if (input.slabId) {
    const slab = await prisma.slab.findUnique({ where: { id: input.slabId }, select: { status: true, lot: { select: { productId: true } } } })
    if (!slab) return { success: false, error: 'Slab not found' }
    if (input.productId && slab.lot.productId !== input.productId) return { success: false, error: 'Selected slab does not belong to the selected product' }
    if (slab.status !== 'AVAILABLE') return { success: false, error: 'Only available slabs can be issued as samples' }
    sampleProductId = slab.lot.productId
  }
  if (input.expectedReturn && Number.isNaN(new Date(input.expectedReturn).getTime())) return { success: false, error: 'Enter a valid expected return date' }

  let loan
  try {
    loan = await prisma.$transaction(async tx => {
      const created = await tx.sampleLoan.create({
        data: {
          contactId,
          productId: sampleProductId,
          slabId: input.slabId,
          expectedReturn: input.expectedReturn ? new Date(input.expectedReturn) : null,
          notes: input.notes || null,
        },
      })
      if (input.slabId) {
        const reserved = await tx.slab.updateMany({
          where: { id: input.slabId, status: 'AVAILABLE' },
          data: { status: 'RESERVED' },
        })
        if (reserved.count !== 1) throw new Error('That slab is no longer available for sample issue')
        const slab = await tx.slab.findUnique({ where: { id: input.slabId }, select: { lotId: true } })
        if (slab) await syncStoneLotTotals(tx, slab.lotId)
      }
      return created
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not issue sample' }
  }
  revalidatePath('/inventory')
  return { success: true, data: loan }
}

export async function updateSampleLoanStatus(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  const parsed = sampleLoanStatusSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  if (parsed.data.status === 'CONVERTED_TO_SALE') {
    return { success: false, error: 'Create the customer invoice first. A sample loan is converted automatically only through the invoice workflow.' }
  }
  const loan = await prisma.sampleLoan.findUnique({ where: { id: parsed.data.id }, select: { slabId: true, status: true, slab: { select: { lotId: true } } } })
  if (!loan) return { success: false, error: 'Sample loan not found' }
  if (loan.status !== 'OUT') return { success: false, error: 'This sample loan has already been closed' }

  await prisma.$transaction(async tx => {
    await tx.sampleLoan.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status, returnedDate: new Date() },
    })
    if (loan.slabId) {
      // A converted slab must be sold through an invoice so price, tax and stock stay linked.
      // It remains reserved for the customer until that invoice is generated.
      if (parsed.data.status !== 'CONVERTED_TO_SALE') {
        await tx.slab.update({
          where: { id: loan.slabId },
          data: { status: parsed.data.status === 'RETURNED' ? 'AVAILABLE' : 'DAMAGED' },
        })
      }
    }
    if (loan.slab?.lotId) await syncStoneLotTotals(tx, loan.slab.lotId)
  })
  revalidatePath('/inventory')
  return { success: true }
}
