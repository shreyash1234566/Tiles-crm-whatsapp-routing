import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

const DEMO = 'TGM_DEMO_2026'
const PRODUCT_IMAGE_BASE = '/tgm/products/'
const PRODUCT_IMAGE_BY_SKU: Record<string, string> = {
  'GVT-600-01': `${PRODUCT_IMAGE_BASE}ivory-vein-600x600.webp`,
  'CER-300-01': `${PRODUCT_IMAGE_BASE}cotto-terra-ceramic-300x300.webp`,
  'WAL-300-01': `${PRODUCT_IMAGE_BASE}aqua-mist-wall-tile-300x450.webp`,
  'DIG-600-01': `${PRODUCT_IMAGE_BASE}calacatta-digital-600x1200.webp`,
  'OUT-300-01': `${PRODUCT_IMAGE_BASE}slate-ash-outdoor-anti-skid-300x300.webp`,
  'WOOD-200-01': `${PRODUCT_IMAGE_BASE}oakline-wood-finish-200x1200.webp`,
  'ADH-20K-01': `${PRODUCT_IMAGE_BASE}bondtite-tile-adhesive-20kg.webp`,
  'GRT-5K-01': `${PRODUCT_IMAGE_BASE}colorlock-epoxy-grout-5kg.webp`,
  'TRM-SS-10': `${PRODUCT_IMAGE_BASE}brushed-steel-edge-profile-10mm.webp`,
  'GRN-BG-18': `${PRODUCT_IMAGE_BASE}black-galaxy-granite-18mm.webp`,
  'GRN-TB-18': `${PRODUCT_IMAGE_BASE}tan-brown-granite-18mm.webp`,
  'GRN-KW-18': `${PRODUCT_IMAGE_BASE}kashmir-white-granite-18mm.webp`,
  'MBL-MK-18': `${PRODUCT_IMAGE_BASE}makrana-white-marble-18mm.webp`,
  'MBL-RJ-18': `${PRODUCT_IMAGE_BASE}rajnagar-white-marble-18mm.webp`,
  'MBL-ST-20': `${PRODUCT_IMAGE_BASE}italian-statuario-marble-20mm.webp`,
  'DEMO-GVT-600': `${PRODUCT_IMAGE_BASE}calacatta-gold-gvt-600x1200.webp`,
  'DEMO-CER-300': `${PRODUCT_IMAGE_BASE}sandstone-beige-ceramic-300x300.webp`,
  'DEMO-GRN-BG': `${PRODUCT_IMAGE_BASE}black-galaxy-granite-18mm.webp`,
  'DEMO-MBL-MK': `${PRODUCT_IMAGE_BASE}makrana-white-marble-18mm.webp`,
  'DEMO-QTZ-WH': `${PRODUCT_IMAGE_BASE}cloud-white-engineered-quartz-20mm.webp`,
}
const IMAGE_URLS = {
  marble: PRODUCT_IMAGE_BY_SKU['DEMO-MBL-MK'],
  marbleVein: PRODUCT_IMAGE_BY_SKU['MBL-ST-20'],
  quartz: PRODUCT_IMAGE_BY_SKU['DEMO-QTZ-WH'],
  tile: PRODUCT_IMAGE_BY_SKU['DEMO-GVT-600'],
  stone: PRODUCT_IMAGE_BY_SKU['DEMO-GRN-BG'],
  kitchen: PRODUCT_IMAGE_BY_SKU['DEMO-GRN-BG'],
}

const daysAgo = (days: number, hour = 11) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date
}

const dayStart = (daysAgoCount: number) => {
  const date = daysAgo(daysAgoCount, 0)
  date.setMinutes(0, 0, 0)
  return date
}

async function ensureContact(data: { name: string; phone: string; email?: string; address: string; state?: string; source: string; notes?: string }) {
  return prisma.contact.upsert({
    where: { phone: data.phone },
    update: data,
    create: data,
  })
}

async function ensureStaff(data: { email: string; name: string; role: string; phone: string; designation: string; basicSalary: number }) {
  return prisma.staff.upsert({
    where: { email: data.email },
    update: data,
    create: { ...data, joinDate: new Date('2025-04-01T00:00:00.000Z'), status: 'Active' },
  })
}

async function ensureLead(data: any) {
  const existing = await prisma.lead.findFirst({ where: { contactId: data.contactId, notes: { contains: DEMO } } })
  if (existing) return existing
  return prisma.lead.create({ data: { ...data, notes: `${DEMO}: ${data.notes}` } })
}

async function ensureWalkin(data: any) {
  const existing = await prisma.walkin.findFirst({ where: { contactId: data.contactId, notes: { contains: DEMO } } })
  if (existing) return existing
  return prisma.walkin.create({ data: { ...data, notes: `${DEMO}: ${data.notes}` } })
}

async function ensureAppointment(data: any) {
  const existing = await prisma.appointment.findFirst({ where: { contactId: data.contactId, purpose: data.purpose, notes: { contains: DEMO } } })
  if (existing) return existing
  return prisma.appointment.create({ data: { ...data, notes: `${DEMO}: ${data.notes}` } })
}

async function ensureExpense(data: any) {
  const existing = await prisma.expense.findFirst({ where: { description: data.description } })
  if (existing) return existing
  return prisma.expense.create({ data })
}

async function ensureSocialMessages(conversationId: string, messages: string[], model: 'social' | 'whatsapp') {
  const count = model === 'social'
    ? await prisma.socialMessage.count({ where: { conversation_id: conversationId } })
    : await prisma.waMessage.count({ where: { conversation_id: conversationId } })
  if (count > 0) return

  for (let index = 0; index < messages.length; index += 1) {
    const customerMessage = index % 2 === 0
    const createdAt = new Date(Date.now() - (messages.length - index) * 45 * 60 * 1000)
    if (model === 'social') {
      await prisma.socialMessage.create({
        data: {
          conversation_id: conversationId,
          platform_msg_id: `${DEMO.toLowerCase()}-social-${conversationId}-${index + 1}`,
          sender_type: customerMessage ? 'customer' : 'agent',
          content_type: 'text',
          content_text: messages[index],
          status: 'read',
          created_at: createdAt,
        },
      })
    } else {
      await prisma.waMessage.create({
        data: {
          conversation_id: conversationId,
          sender_type: customerMessage ? 'customer' : 'agent',
          content_type: 'text',
          content_text: messages[index],
          message_id: `${DEMO.toLowerCase()}-wa-${conversationId}-${index + 1}`,
          status: 'read',
          created_at: createdAt,
        },
      })
    }
  }
}

async function seedInventory() {
  const categoryNames = [
    'Vitrified Tiles (GVT/PGVT)', 'Ceramic Tiles', 'Wall Tiles', 'Digital Tiles',
    'Outdoor / Anti-Skid Tiles', 'Granite Slabs', 'Marble Slabs (Indian)',
    'Marble Slabs (Imported)', 'Engineered Quartz', 'Tile Adhesive & Grout', 'Trims & Edge Profiles',
  ]
  const categories: Record<string, any> = {}
  for (const name of categoryNames) {
    categories[name] = await prisma.category.upsert({ where: { name }, update: {}, create: { name } })
  }

  const showroomWarehouse = await prisma.warehouse.upsert({ where: { name: 'Demo Showroom Warehouse' }, update: {}, create: { name: 'Demo Showroom Warehouse', address: 'Ring Road, Ahmedabad' } })
  const tileWarehouse = await prisma.warehouse.upsert({ where: { name: 'Demo Tile Warehouse' }, update: {}, create: { name: 'Demo Tile Warehouse', address: 'Vatva GIDC, Ahmedabad' } })

  const showroom = await prisma.godown.findFirst({ where: { name: 'Demo Showroom' } })
    ?? await prisma.godown.create({ data: { name: 'Demo Showroom', type: 'Showroom', isDefault: false, address: 'Ring Road, Ahmedabad' } })
  const tileGodown = await prisma.godown.findFirst({ where: { name: 'Demo Tile Godown' } })
    ?? await prisma.godown.create({ data: { name: 'Demo Tile Godown', type: 'Warehouse', isDefault: false, address: 'Vatva GIDC, Ahmedabad' } })
  const stoneYard = await prisma.godown.findFirst({ where: { name: 'Demo Stone Yard' } })
    ?? await prisma.godown.create({ data: { name: 'Demo Stone Yard', type: 'Warehouse', isDefault: false, address: 'Kishangarh Marble Market, Rajasthan' } })

  const productInputs: any[] = [
    { sku: 'DEMO-GVT-600', name: 'Calacatta Gold GVT 600x1200', category: 'Vitrified Tiles (GVT/PGVT)', price: 1480, stock: 72, costPrice: 940, unitOfMeasure: 'BOX', materialCategory: 'TILE', material: 'GVT', color: 'White with Gold Veins', tileSize: '600x1200', finish: 'Polished', coveragePerBox: 15.50, tilesPerBox: 2, applicationArea: 'floor', hsnCode: '6908', image: IMAGE_URLS.tile, description: 'Premium marble-look GVT tile, sold by box. Demo stock: 15.50 sq.ft per box.' },
    { sku: 'DEMO-CER-300', name: 'Sandstone Beige Ceramic 300x300', category: 'Ceramic Tiles', price: 590, stock: 96, costPrice: 340, unitOfMeasure: 'BOX', materialCategory: 'TILE', material: 'Ceramic', color: 'Beige', tileSize: '300x300', finish: 'Matt', coveragePerBox: 11.62, tilesPerBox: 15, applicationArea: 'bathroom', hsnCode: '6907', image: IMAGE_URLS.kitchen, description: 'Matte ceramic tile for bathroom and utility areas.' },
    { sku: 'DEMO-GRN-BG', name: 'Black Galaxy Granite 18mm Demo', category: 'Granite Slabs', price: 265, stock: 0, costPrice: 180, unitOfMeasure: 'SLAB', materialCategory: 'GRANITE', material: 'Granite', color: 'Black with Gold Flecks', finish: 'Polished', origin: 'Andhra Pradesh', thicknessMm: 18, qualityGrade: 'Premium', applicationArea: 'kitchen_platform', hsnCode: '68022300', image: IMAGE_URLS.stone, isSlabTracked: true, description: 'Serialized natural granite slabs; bill by actual measured sq.ft.' },
    { sku: 'DEMO-MBL-MK', name: 'Makrana White Marble 18mm Demo', category: 'Marble Slabs (Indian)', price: 315, stock: 0, costPrice: 225, unitOfMeasure: 'SLAB', materialCategory: 'MARBLE', material: 'Marble', color: 'White', finish: 'Polished', origin: 'Makrana, Rajasthan', thicknessMm: 18, qualityGrade: 'Premium', applicationArea: 'floor', hsnCode: '68022110', image: IMAGE_URLS.marble, isSlabTracked: true, description: 'Indian marble slabs for flooring, vanity and cladding.' },
    { sku: 'DEMO-QTZ-WH', name: 'Cloud White Engineered Quartz 20mm', category: 'Engineered Quartz', price: 560, stock: 0, costPrice: 390, unitOfMeasure: 'SLAB', materialCategory: 'ENGINEERED_QUARTZ', material: 'Engineered Quartz', color: 'Cloud White', finish: 'Honed', origin: 'India', thicknessMm: 20, qualityGrade: 'Grade A', applicationArea: 'kitchen_platform', hsnCode: '68109990', image: IMAGE_URLS.quartz, isSlabTracked: true, description: 'Consistent engineered quartz slab for modular kitchen projects.' },
  ]

  const products: Record<string, any> = {}
  for (const input of productInputs) {
    const { category: categoryName, ...productData } = input
    const product = await prisma.product.upsert({
      where: { sku: input.sku },
      update: { ...productData, categoryId: categories[categoryName].id, warehouseId: input.unitOfMeasure === 'SLAB' ? showroomWarehouse.id : tileWarehouse.id },
      create: { ...productData, categoryId: categories[categoryName].id, warehouseId: input.unitOfMeasure === 'SLAB' ? showroomWarehouse.id : tileWarehouse.id, lastRestocked: daysAgo(8) },
    })
    products[input.sku] = product
    if (input.unitOfMeasure !== 'SLAB') {
      await prisma.godownStock.upsert({ where: { productId_godownId: { productId: product.id, godownId: tileGodown.id } }, update: { quantity: input.stock }, create: { productId: product.id, godownId: tileGodown.id, quantity: input.stock } })
      const ledger = await prisma.stockLedger.findFirst({ where: { productId: product.id, godownId: tileGodown.id, referenceType: DEMO } })
      if (!ledger) await prisma.stockLedger.create({ data: { productId: product.id, godownId: tileGodown.id, entryType: 'IN', quantity: input.stock, balanceAfter: input.stock, referenceType: DEMO, notes: 'Opening demo stock' } })
    }
  }

  // Keep the demo catalog honest: every seeded TGM SKU gets a matching local
  // catalog visual, while unrelated user products remain untouched.
  const tgmProducts = await prisma.product.findMany({ where: { sku: { in: Object.keys(PRODUCT_IMAGE_BY_SKU) } } })
  for (const product of tgmProducts) {
    const image = PRODUCT_IMAGE_BY_SKU[product.sku]
    if (!image || product.image === image) continue
    await prisma.product.update({ where: { id: product.id }, data: { image } })
  }

  const supplier = await prisma.supplier.findFirst({ where: { name: 'Demo Stone & Tile Suppliers' } })
    ?? await prisma.supplier.create({ data: { name: 'Demo Stone & Tile Suppliers', phone: '+91 90000 20001', email: 'purchase@demo-tgm.example', address: 'Kishangarh Marble Market, Rajasthan', contactPerson: 'Arjun Mehta', gstNumber: '08AAACD1234E1Z5', paymentTerms: 30 } })

  const lotInputs: any[] = [
    { lotNumber: 'DEMO-BG-2026-01', sku: 'DEMO-GRN-BG', origin: 'Ongole, Andhra Pradesh', shadeCode: 'BG-DEMO-A', qualityGrade: 'Premium', costPerSqft: 180, image: IMAGE_URLS.stone, slabs: [['01/04', 126, 74], ['02/04', 128, 76], ['03/04', 124, 73], ['04/04', 120, 72]] },
    { lotNumber: 'DEMO-MK-2026-01', sku: 'DEMO-MBL-MK', origin: 'Makrana, Rajasthan', shadeCode: 'MK-DEMO-A', qualityGrade: 'Premium', costPerSqft: 225, image: IMAGE_URLS.marble, slabs: [['01/04', 120, 72], ['02/04', 118, 70], ['03/04', 122, 72], ['04/04', 116, 70]] },
    { lotNumber: 'DEMO-QZ-2026-01', sku: 'DEMO-QTZ-WH', origin: 'Morbi, Gujarat', shadeCode: 'QZ-DEMO-WH', qualityGrade: 'Grade A', costPerSqft: 390, image: IMAGE_URLS.quartz, slabs: [['01/03', 126, 63], ['02/03', 126, 63], ['03/03', 120, 60]] },
  ]
  for (const input of lotInputs) {
    const product = products[input.sku]
    const lot = await prisma.stoneLot.upsert({
      where: { lotNumber: input.lotNumber },
      update: { productId: product.id, supplierId: supplier.id, origin: input.origin, shadeCode: input.shadeCode, qualityGrade: input.qualityGrade, costPerSqft: input.costPerSqft, photos: [input.image], notes: `${DEMO}: showroom demo lot for training and testing` },
      create: { lotNumber: input.lotNumber, productId: product.id, supplierId: supplier.id, origin: input.origin, purchaseDate: daysAgo(12), shadeCode: input.shadeCode, qualityGrade: input.qualityGrade, costPerSqft: input.costPerSqft, photos: [input.image], notes: `${DEMO}: showroom demo lot for training and testing` },
    })
    for (const [slabNumber, lengthInches, widthInches] of input.slabs) {
      const sqft = Math.round((lengthInches * widthInches / 144) * 100) / 100
      await prisma.slab.upsert({
        where: { lotId_slabNumber: { lotId: lot.id, slabNumber } },
        update: { lengthInches, widthInches, sqft, thicknessMm: product.thicknessMm, photo: input.image, qcGrade: input.qualityGrade, godownId: stoneYard.id },
        create: { lotId: lot.id, slabNumber, lengthInches, widthInches, sqft, thicknessMm: product.thicknessMm, photo: input.image, qcGrade: input.qualityGrade, godownId: stoneYard.id, status: 'AVAILABLE' },
      })
    }
    const totals = await prisma.slab.aggregate({ where: { lotId: lot.id }, _count: { _all: true }, _sum: { sqft: true } })
    const available = await prisma.slab.aggregate({ where: { lotId: lot.id, status: 'AVAILABLE' }, _sum: { sqft: true } })
    await prisma.stoneLot.update({ where: { id: lot.id }, data: { totalSlabs: totals._count._all, totalSqft: totals._sum.sqft || 0, availableSqft: available._sum.sqft || 0 } })
  }

  return { products, showroom, tileGodown, stoneYard, supplier }
}

async function seedCustomersAndSales(inventory: any, staff: any, secondStaff: any) {
  const contactData = [
    ['Aarav Shah', '+91 90000 10001', 'aarav@example.com', 'Bodakdev, Ahmedabad', 'Gujarat', 'Website'],
    ['Meera Patel', '+91 90000 10002', 'meera@example.com', 'Satellite, Ahmedabad', 'Gujarat', 'Instagram'],
    ['Rohan Kapoor', '+91 90000 10003', 'rohan@example.com', 'Vastrapur, Ahmedabad', 'Gujarat', 'Walk-in'],
    ['Nisha Desai', '+91 90000 10004', 'nisha@example.com', 'Prahladnagar, Ahmedabad', 'Gujarat', 'Referral'],
    ['Kabir Joshi', '+91 90000 10005', 'kabir@example.com', 'Thaltej, Ahmedabad', 'Gujarat', 'WhatsApp'],
    ['Ishita Rao', '+91 90000 10006', 'ishita@example.com', 'Shilaj, Ahmedabad', 'Gujarat', 'IndiaMART'],
    ['Dev Malhotra', '+91 90000 10007', 'dev@example.com', 'Vaishnodevi Circle, Ahmedabad', 'Gujarat', 'Facebook'],
    ['Tara Iyer', '+91 90000 10008', 'tara@example.com', 'Navrangpura, Ahmedabad', 'Gujarat', 'Showroom'],
    ['Samar Khan', '+91 90000 10009', 'samar@example.com', 'Bopal, Ahmedabad', 'Gujarat', 'WhatsApp'],
    ['Kavya Menon', '+91 90000 10010', 'kavya@example.com', 'Vejalpur, Ahmedabad', 'Gujarat', 'Website'],
    ['Harshit Jain', '+91 90000 10011', 'harshit@example.com', 'Chandkheda, Ahmedabad', 'Gujarat', 'Facebook'],
    ['Ayesha Shah', '+91 90000 10012', 'ayesha@example.com', 'Gota, Ahmedabad', 'Gujarat', 'Instagram'],
    ['Manav Trivedi', '+91 90000 10013', 'manav@example.com', 'Thaltej, Ahmedabad', 'Gujarat', 'Referral'],
    ['Pallavi Joshi', '+91 90000 10014', 'pallavi@example.com', 'Shela, Ahmedabad', 'Gujarat', 'Showroom'],
    ['Yash Mehta', '+91 90000 10015', 'yash@example.com', 'Makarba, Ahmedabad', 'Gujarat', 'WhatsApp'],
    ['Zoya Pathan', '+91 90000 10016', 'zoya@example.com', 'Motera, Ahmedabad', 'Gujarat', 'Instagram'],
  ]
  const contacts: any[] = []
  for (const [name, phone, email, address, state, source] of contactData) {
    contacts.push(await ensureContact({ name, phone, email, address, state, source, notes: `${DEMO}: TGM demo customer` }))
  }

  const leadData = [
    { contactId: contacts[0].id, interest: 'Calacatta Gold GVT for living room', materialCategory: 'TILE', applicationArea: 'floor', areaSqft: 850, budget: '₹2–4 lakh', status: 'QUOTATION', source: 'Website', date: daysAgo(2), notes: 'Needs shade and batch matching for living room and passage.', assignedToId: staff.id },
    { contactId: contacts[1].id, interest: 'Makrana marble vanity top', materialCategory: 'MARBLE', applicationArea: 'vanity', areaSqft: 42, budget: '₹50,000–₹1 lakh', status: 'CONTACTED', source: 'Instagram', date: daysAgo(4), notes: 'Shared two reference images; wants honed finish.', assignedToId: staff.id },
    { contactId: contacts[2].id, interest: 'Black Galaxy kitchen platform', materialCategory: 'GRANITE', applicationArea: 'kitchen_platform', areaSqft: 68, budget: '₹75,000–₹1.25 lakh', status: 'SHOWROOM_VISIT', source: 'Walk-in', date: daysAgo(1), notes: 'Site measurement required before final slab selection.', assignedToId: secondStaff.id },
    { contactId: contacts[3].id, interest: 'Anti-skid outdoor tiles', materialCategory: 'TILE', applicationArea: 'outdoor', areaSqft: 420, budget: '₹1–2 lakh', status: 'NEW', source: 'Referral', date: daysAgo(6), notes: 'Farmhouse driveway and sit-out.', assignedToId: staff.id },
    { contactId: contacts[5].id, interest: 'Imported marble wall cladding', materialCategory: 'MARBLE', applicationArea: 'wall_cladding', areaSqft: 260, budget: '₹4–6 lakh', status: 'WON', source: 'IndiaMART', date: daysAgo(12), notes: 'Approved Statuario-style sample; dispatch after site approval.', assignedToId: secondStaff.id },
    { contactId: contacts[8].id, interest: 'Large-format porcelain tiles for hotel lobby', materialCategory: 'TILE', applicationArea: 'commercial_floor', areaSqft: 1250, budget: '₹4–6 lakh', status: 'NEW', source: 'WhatsApp', date: daysAgo(1), notes: 'Needs anti-slip rating, batch availability and delivery before month-end.', assignedToId: staff.id },
    { contactId: contacts[9].id, interest: 'Tan Brown granite for kitchen and utility', materialCategory: 'GRANITE', applicationArea: 'kitchen_platform', areaSqft: 92, budget: '₹1–2 lakh', status: 'CONTACTED', source: 'Website', date: daysAgo(3), notes: 'Share actual lot photos and confirm sink plus hob cutout measurements.', assignedToId: secondStaff.id },
    { contactId: contacts[10].id, interest: 'Outdoor anti-skid tiles for terrace', materialCategory: 'TILE', applicationArea: 'terrace', areaSqft: 560, budget: '₹2–4 lakh', status: 'SHOWROOM_VISIT', source: 'Facebook', date: daysAgo(5), notes: 'Customer wants R11/R12 grip and a grey stone-look finish.', assignedToId: staff.id },
    { contactId: contacts[11].id, interest: 'Rajnagar marble for staircase and feature wall', materialCategory: 'MARBLE', applicationArea: 'staircase', areaSqft: 310, budget: '₹2–4 lakh', status: 'QUOTATION', source: 'Instagram', date: daysAgo(8), notes: 'Prepare separate material, fabrication and installation lines.', assignedToId: secondStaff.id },
  ]
  const leads: any[] = []
  for (const data of leadData) {
    const lead = await ensureLead(data)
    leads.push(lead)
    const existingFollowUp = await prisma.followUp.findFirst({ where: { leadId: lead.id, message: { contains: DEMO } } })
    if (!existingFollowUp) await prisma.followUp.create({ data: { leadId: lead.id, day: 2, message: `${DEMO}: confirm measurement and shade approval`, sent: false, date: new Date(Date.now() + 2 * 86400000) } })
  }

  const walkinData = [
    { contactId: contacts[2].id, requirement: 'Kitchen platform with sink cutout', roomType: 'Kitchen', materialCategory: 'GRANITE', applicationArea: 'kitchen_platform', areaSqft: 68, assignedToId: secondStaff.id, date: daysAgo(1), time: '11:30 AM', status: 'INTERESTED', budget: '₹75,000–₹1.25 lakh', source: 'Walk-in', visitDuration: '42 min', notes: 'Shortlisted Black Galaxy and Tan Brown. Book site measurement.' },
    { contactId: contacts[7].id, requirement: 'Bathroom and balcony tile selection', roomType: 'Bathroom', materialCategory: 'TILE', applicationArea: 'bathroom', areaSqft: 180, assignedToId: staff.id, date: daysAgo(3), time: '04:15 PM', status: 'FOLLOW_UP', budget: '₹60,000–₹1 lakh', source: 'Walk-in', visitDuration: '35 min', notes: 'Send anti-skid and grout options on WhatsApp.' },
    { contactId: contacts[4].id, requirement: 'Living room marble flooring', roomType: 'Living Room', materialCategory: 'MARBLE', applicationArea: 'floor', areaSqft: 620, assignedToId: staff.id, date: daysAgo(5), time: '01:00 PM', status: 'CONVERTED', budget: '₹2–4 lakh', source: 'WhatsApp', visitDuration: '55 min', notes: 'Quotation shared for Makrana and Rajnagar options.' },
    { contactId: contacts[3].id, requirement: 'Outdoor anti-skid tiles', roomType: 'Outdoor', materialCategory: 'TILE', applicationArea: 'outdoor', areaSqft: 420, assignedToId: secondStaff.id, date: daysAgo(7), time: '12:10 PM', status: 'LEFT', budget: '₹1–2 lakh', source: 'Walk-in', visitDuration: '18 min', notes: 'Customer comparing two suppliers; follow up in one week.' },
    { contactId: contacts[12].id, requirement: 'Marble staircase treads and risers', roomType: 'Staircase', materialCategory: 'MARBLE', applicationArea: 'staircase', areaSqft: 145, assignedToId: secondStaff.id, date: daysAgo(2), time: '10:15 AM', status: 'INTERESTED', budget: '₹1–2 lakh', source: 'Showroom', visitDuration: '48 min', notes: 'Shortlisted Rajnagar White; needs site measurement and nosing detail.' },
    { contactId: contacts[13].id, requirement: 'Retail shop floor and wall tiles', roomType: 'Commercial', materialCategory: 'TILE', applicationArea: 'commercial_floor', areaSqft: 980, assignedToId: staff.id, date: daysAgo(4), time: '02:30 PM', status: 'FOLLOW_UP', budget: '₹2–4 lakh', source: 'Referral', visitDuration: '31 min', notes: 'Send commercial-grade options with shade continuity and lead time.' },
    { contactId: contacts[14].id, requirement: 'Quartz island top with waterfall edge', roomType: 'Kitchen', materialCategory: 'ENGINEERED_QUARTZ', applicationArea: 'kitchen_platform', areaSqft: 54, assignedToId: secondStaff.id, date: daysAgo(6), time: '05:00 PM', status: 'BROWSING', budget: '₹1–2 lakh', source: 'Showroom', visitDuration: '27 min', notes: 'Comparing Cloud White quartz with a light marble-look option.' },
    { contactId: contacts[15].id, requirement: 'Bathroom wall and floor tile package', roomType: 'Bathroom', materialCategory: 'TILE', applicationArea: 'bathroom', areaSqft: 240, assignedToId: staff.id, date: daysAgo(9), time: '11:45 AM', status: 'CONVERTED', budget: '₹60,000–₹1 lakh', source: 'Instagram', visitDuration: '39 min', notes: 'Selected matte floor tile, glossy wall tile and matching epoxy grout.' },
  ]
  for (const data of walkinData) await ensureWalkin(data)

  await ensureAppointment({ contactId: contacts[0].id, date: new Date(Date.now() + 2 * 86400000), time: '10:30 AM', purpose: 'Site measurement – living room flooring', status: 'Scheduled', notes: 'Carry laser measure and tile samples.' })
  await ensureAppointment({ contactId: contacts[2].id, date: new Date(Date.now() + 86400000), time: '03:00 PM', purpose: 'Kitchen platform measurement', status: 'Confirmed', notes: 'Check sink, hob and backsplash cutouts.' })
  await ensureAppointment({ contactId: contacts[1].id, date: daysAgo(2), time: '05:30 PM', purpose: 'Marble sample review', status: 'Completed', notes: 'Customer approved white marble family.' })
  await ensureAppointment({ contactId: contacts[10].id, date: new Date(Date.now() + 4 * 86400000), time: '12:00 PM', purpose: 'Outdoor tile shade and grip review', status: 'Scheduled', notes: 'Keep R11/R12 anti-skid samples ready.' })
  await ensureAppointment({ contactId: contacts[14].id, date: new Date(Date.now() + 6 * 86400000), time: '04:30 PM', purpose: 'Quartz island slab selection', status: 'Confirmed', notes: 'Show Cloud White quartz and edge profile samples.' })

  const tile = inventory.products['DEMO-GVT-600']
  const ceramic = inventory.products['DEMO-CER-300']
  const granite = inventory.products['DEMO-GRN-BG']
  const quotationSpecs = [
    { displayId: 'DEMO-QUO-0001', contact: contacts[0], projectName: 'Shah Residence – Living Flooring', status: 'SENT', product: tile, quantity: 55, areaSqft: 850, rate: 1480, freight: 4500, loading: 1800, installation: 25500 },
    { displayId: 'DEMO-QUO-0002', contact: contacts[2], projectName: 'Joshi Kitchen Platform', status: 'APPROVED', product: granite, quantity: 1, areaSqft: 68, rate: 265, freight: 2500, loading: 1200, installation: 8500 },
    { displayId: 'DEMO-QUO-0003', contact: contacts[7], projectName: 'Iyer Bathroom Renovation', status: 'DRAFT', product: ceramic, quantity: 20, areaSqft: 232, rate: 590, freight: 1200, loading: 500, installation: 7000 },
  ]
  for (const spec of quotationSpecs) {
    const subtotal = spec.quantity * spec.rate
    const gst = Math.round(subtotal * 0.18)
    const total = subtotal + gst + spec.freight + spec.loading + spec.installation
    const existing = await prisma.quotation.findUnique({ where: { displayId: spec.displayId } })
    if (!existing) {
      await prisma.quotation.create({ data: { displayId: spec.displayId, contactId: spec.contact.id, date: daysAgo(3), validUntil: new Date(Date.now() + 12 * 86400000), projectName: spec.projectName, deliveryMode: 'Delivered to site', roadPermit: 'Customer site access to be confirmed', emailId: spec.contact.email, contactPerson: spec.contact.name, dispatchAddress: spec.contact.address, installationPercent: 5, discountType: 'PERCENT', discountValue: 0, discountAmount: 0, installationCharge: spec.installation, freightCharge: spec.freight, loadingCharge: spec.loading, gstPercent: 18, gstAmount: gst, totalBeforeTax: subtotal + spec.freight + spec.loading + spec.installation, grandTotal: total, status: spec.status as any, notes: `${DEMO}: sample quotation for training`, termsAndConditions: ['Shade and batch to be approved before dispatch.', 'Measured area and site conditions may change final quantity.'], items: { create: [{ productId: spec.product.id, name: spec.product.name, sku: spec.product.sku, description: 'Demo line item', quantity: spec.quantity, unitOfMeasure: spec.product.unitOfMeasure, areaSqft: spec.areaSqft, coveragePerBox: spec.product.coveragePerBox, rate: spec.rate, amount: subtotal, sortOrder: 0 }] } } })
    }
  }

  const invoiceSpecs = [
    { displayId: 'DEMO-INV-0001', contact: contacts[4], product: ceramic, quantity: 12, amountPaid: 4000, method: 'UPI', status: 'PARTIAL' },
    { displayId: 'DEMO-INV-0002', contact: contacts[5], product: tile, quantity: 20, amountPaid: 34900, method: 'Bank Transfer', status: 'PAID' },
    { displayId: 'DEMO-INV-0003', contact: contacts[7], product: ceramic, quantity: 8, amountPaid: 0, method: 'Cash', status: 'PENDING' },
  ]
  for (const spec of invoiceSpecs) {
    const subtotal = spec.product.price * spec.quantity
    const gst = Math.round(subtotal * 0.18)
    const total = subtotal + gst
    const existing = await prisma.invoice.findUnique({ where: { displayId: spec.displayId } })
    if (!existing) {
      const invoice = await prisma.invoice.create({ data: { displayId: spec.displayId, contactId: spec.contact.id, subtotal, discount: 0, gst, cgst: Math.round(gst / 2), sgst: Math.round(gst / 2), igst: 0, cess: 0, total, amountPaid: spec.amountPaid, balanceDue: Math.max(0, total - spec.amountPaid), paymentMethod: spec.method, paymentStatus: spec.status as any, invoiceStatus: 'ACTIVE', transportCost: 1000, freightCharge: 800, loadingCharge: 300, installationCharge: 0, roadPermit: 'Not required', godownId: inventory.tileGodown.id, supplyType: 'INTRASTATE', placeOfSupply: 'Gujarat', date: daysAgo(2), dueDate: new Date(Date.now() + 28 * 86400000), salespersonId: staff.id, notes: `${DEMO}: demo invoice for billing walkthrough`, items: { create: [{ productId: spec.product.id, name: spec.product.name, sku: spec.product.sku, quantity: spec.quantity, unitOfMeasure: spec.product.unitOfMeasure, coveragePerBox: spec.product.coveragePerBox, price: spec.product.price, hsnCode: spec.product.hsnCode, gstRate: 18, taxableAmount: subtotal, cgst: Math.round(gst / 2), sgst: Math.round(gst / 2) }] } } })
      if (spec.amountPaid > 0) await prisma.payment.create({ data: { invoiceId: invoice.id, amount: spec.amountPaid, method: spec.method, reference: `${DEMO}-${spec.displayId}`, date: daysAgo(1), notes: 'Demo payment' } })
    }
  }

  return { contacts, leads, tile, ceramic, granite }
}

async function seedOperations(inventory: any, contacts: any[], staff: any, secondStaff: any) {
  const customOrder = await prisma.customOrder.upsert({
    where: { displayId: 'DEMO-JOB-0001' },
    update: { status: 'IN_PRODUCTION', areaSqft: 68, referenceProductId: inventory.products['DEMO-GRN-BG'].id },
    create: { displayId: 'DEMO-JOB-0001', contactId: contacts[2].id, phone: contacts[2].phone, address: contacts[2].address || 'Ahmedabad', type: 'Kitchen Platform', status: 'IN_PRODUCTION', assignedStaffId: secondStaff.id, date: daysAgo(3), estimatedDelivery: new Date(Date.now() + 8 * 86400000), measurements: { kitchenL: 18.5, kitchenR: 21.2, depth: 2.1, unit: 'ft' }, photos: [IMAGE_URLS.kitchen], referenceImages: [IMAGE_URLS.stone], referenceProductId: inventory.products['DEMO-GRN-BG'].id, materials: 'Black Galaxy Granite 18mm', color: 'Black with gold flecks', quotedPrice: 78500, advancePaid: 30000, productionNotes: 'Confirm sink and hob cutout template before CNC.', installationType: 'Kitchen Platform', edgeProfile: 'Eased', cutouts: [{ type: 'Undermount sink', count: 1 }, { type: 'Hob', count: 1 }], templateMethod: 'Digital/Laser Template', areaSqft: 68, wastagePercent: 12 },
  })
  const timelineExists = await prisma.customOrderTimeline.findFirst({ where: { customOrderId: customOrder.id, event: { contains: DEMO } } })
  if (!timelineExists) {
    await prisma.customOrderTimeline.createMany({ data: [
      { customOrderId: customOrder.id, date: daysAgo(3), event: `${DEMO}: Site measurement completed`, notes: 'Laser measurement uploaded.', status: 'completed', updatedBy: staff.name },
      { customOrderId: customOrder.id, date: daysAgo(1), event: `${DEMO}: Slab selected for cutting`, notes: 'Customer approved shade family.', status: 'completed', updatedBy: secondStaff.name },
    ] })
  }

  const workCenter = await prisma.workCenter.findFirst({ where: { name: 'CNC / Waterjet Cutting' } })
  const bom = await prisma.billOfMaterials.findFirst({ where: { name: 'DEMO Kitchen Platform Fabrication BOM' } })
    ?? await prisma.billOfMaterials.create({ data: { name: 'DEMO Kitchen Platform Fabrication BOM', finishedProductId: inventory.products['DEMO-GRN-BG'].id, version: '1.0', estimatedDays: 5, notes: `${DEMO}: cutting, edge profiling and polishing route`, items: { create: [{ rawMaterialId: inventory.products['DEMO-GRN-BG'].id, quantity: 1, unitOfMeasure: 'SLAB', wastagePercent: 12, unitCost: 180, notes: 'Issue one slab after approval.' }] }, steps: { create: [{ stepNumber: 1, operationName: 'Template and measurement review', workCenterId: workCenter?.id, durationMins: 60, labourRatePerHour: 350 }, { stepNumber: 2, operationName: 'CNC cutouts and edge profiling', workCenterId: workCenter?.id, durationMins: 240, labourRatePerHour: 450 }, { stepNumber: 3, operationName: 'Polish, QC and packing', workCenterId: (await prisma.workCenter.findFirst({ where: { name: 'Polishing' } }))?.id, durationMins: 180, labourRatePerHour: 400 }] } } })
  const production = await prisma.productionOrder.upsert({ where: { displayId: 'DEMO-PROD-0001' }, update: { status: 'IN_PROGRESS', customOrderId: customOrder.id }, create: { displayId: 'DEMO-PROD-0001', bomId: bom.id, finishedProductId: inventory.products['DEMO-GRN-BG'].id, customOrderId: customOrder.id, workCenterId: workCenter?.id, plannedQty: 1, actualQty: 0, status: 'IN_PROGRESS', priority: 'HIGH', dueDate: new Date(Date.now() + 5 * 86400000), startDate: daysAgo(1), totalMaterialCost: 12240, totalLabourCost: 4200, overheadCost: 1500, totalCost: 17940, costPerUnit: 17940, standardMins: 480, notes: `${DEMO}: fabrication job tracking sample` } })
  const productionStep = await prisma.productionStep.findFirst({ where: { productionOrderId: production.id, stepNumber: 1 } })
  if (!productionStep) await prisma.productionStep.createMany({ data: [{ productionOrderId: production.id, workCenterId: workCenter?.id, stepNumber: 1, operationName: 'Template and measure review', status: 'DONE', plannedMins: 60, actualMins: 55, labourRatePerHour: 350 }, { productionOrderId: production.id, workCenterId: workCenter?.id, stepNumber: 2, operationName: 'CNC cutouts and edge profiling', status: 'IN_PROGRESS', plannedMins: 240, labourRatePerHour: 450 }, { productionOrderId: production.id, stepNumber: 3, operationName: 'Polish and final QC', status: 'PENDING', plannedMins: 180, labourRatePerHour: 400 }] })
  const consumption = await prisma.materialConsumption.findFirst({ where: { productionOrderId: production.id } })
  if (!consumption) await prisma.materialConsumption.create({ data: { productionOrderId: production.id, rawMaterialId: inventory.products['DEMO-GRN-BG'].id, plannedQty: 1, issuedQty: 1, actualQty: 0.85, scrapQty: 0.08, returnedQty: 0.07, unitCost: 180, totalCost: 12240, scrapReason: 'Cutout and edge trimming offcut' } })

  const transfer = await prisma.godownTransfer.upsert({ where: { displayId: 'DEMO-TRF-0001' }, update: { status: 'Approved' }, create: { displayId: 'DEMO-TRF-0001', fromGodownId: inventory.tileGodown.id, toGodownId: inventory.showroom.id, status: 'Approved', date: daysAgo(4), notes: `${DEMO}: replenish showroom display stock`, requestedBy: staff.name, approvedBy: secondStaff.name, items: { create: [{ productId: inventory.products['DEMO-GVT-600'].id, name: inventory.products['DEMO-GVT-600'].name, sku: inventory.products['DEMO-GVT-600'].sku, quantity: 12 }] } } })
  void transfer

  const purchaseProduct = inventory.products['DEMO-GVT-600']
  const purchaseSubtotal = purchaseProduct.costPrice * 48
  const purchaseGst = Math.round(purchaseSubtotal * 0.18)
  const purchaseOrder = await prisma.purchaseOrder.upsert({
    where: { displayId: 'DEMO-PO-0001' },
    update: { status: 'PARTIALLY_RECEIVED', subtotal: purchaseSubtotal, gst: purchaseGst, total: purchaseSubtotal + purchaseGst, balanceDue: purchaseSubtotal + purchaseGst - 20000 },
    create: { displayId: 'DEMO-PO-0001', supplierId: inventory.supplier.id, status: 'PARTIALLY_RECEIVED' as any, subtotal: purchaseSubtotal, discount: 0, gst: purchaseGst, cgst: Math.round(purchaseGst / 2), sgst: Math.round(purchaseGst / 2), total: purchaseSubtotal + purchaseGst, amountPaid: 20000, balanceDue: purchaseSubtotal + purchaseGst - 20000, date: daysAgo(9), expectedDate: daysAgo(2), notes: `${DEMO}: incoming GVT replenishment with shade batch matching`, createdBy: staff.name, items: { create: [{ productId: purchaseProduct.id, name: purchaseProduct.name, sku: purchaseProduct.sku, hsnCode: purchaseProduct.hsnCode, quantity: 48, receivedQty: 24, unitCost: purchaseProduct.costPrice, gstRate: 18, amount: purchaseSubtotal }] } },
  })
  const purchasePayment = await prisma.purchasePayment.findFirst({ where: { poId: purchaseOrder.id } })
  if (!purchasePayment) await prisma.purchasePayment.create({ data: { poId: purchaseOrder.id, amount: 20000, method: 'Bank Transfer', reference: `${DEMO}-PO-ADVANCE`, paidAt: daysAgo(7), notes: 'Demo supplier advance', createdBy: staff.name } })
  await prisma.productBatch.upsert({ where: { productId_batchNumber: { productId: purchaseProduct.id, batchNumber: 'DEMO-BATCH-GVT-001' } }, update: { quantity: 48, remainingQty: 48, costPrice: purchaseProduct.costPrice, supplierId: inventory.supplier.id, poId: purchaseOrder.id, shadeCode: 'CAL-GOLD-DEMO' }, create: { productId: purchaseProduct.id, batchNumber: 'DEMO-BATCH-GVT-001', purchaseDate: daysAgo(8), quantity: 48, remainingQty: 48, costPrice: purchaseProduct.costPrice, supplierId: inventory.supplier.id, poId: purchaseOrder.id, shadeCode: 'CAL-GOLD-DEMO' } })

  const sampleLoan = await prisma.sampleLoan.findFirst({ where: { contactId: contacts[1].id, notes: { contains: DEMO } } })
  if (!sampleLoan) await prisma.sampleLoan.create({ data: { contactId: contacts[1].id, productId: inventory.products['DEMO-CER-300'].id, checkoutDate: daysAgo(2), expectedReturn: new Date(Date.now() + 5 * 86400000), status: 'OUT', notes: `${DEMO}: bathroom tile sample issued for shade approval` } })
  const callLog = await prisma.callLog.findFirst({ where: { contactId: contacts[0].id, notes: { contains: DEMO } } })
  if (!callLog) await prisma.callLog.create({ data: { contactId: contacts[0].id, customerName: contacts[0].name, phone: contacts[0].phone, direction: 'OUTBOUND' as any, status: 'COMPLETED' as any, duration: '04:18', durationSec: 258, agent: staff.name, date: daysAgo(2), time: '11:45 AM', notes: `${DEMO}: confirmed site measurement appointment and tile quantity review` } })

  const expenseCategories: Array<[string, string, string, number]> = [
    ['Transport & Loading', 'Truck', '#2563eb', 50000], ['Site Measurement', 'Ruler', '#16a34a', 20000], ['Workshop Consumables', 'Wrench', '#f97316', 30000], ['Tea & Staff Welfare', 'Coffee', '#a855f7', 12000],
  ]
  const categories: Record<string, any> = {}
  for (const [name, icon, color, budget] of expenseCategories) categories[name] = await prisma.expenseCategory.upsert({ where: { name }, update: { icon, color, budget, isActive: true }, create: { name, icon, color, budget, isDefault: false, isActive: true } })
  await ensureExpense({ date: daysAgo(1), categoryId: categories['Transport & Loading'].id, amount: 3200, description: `${DEMO} – mini truck loading for Black Galaxy display slabs`, paymentMode: 'UPI', reference: 'UPI-DEMO-001', vendor: 'Shree Balaji Transport', staffId: staff.id, status: 'Approved', approvedBy: secondStaff.name, notes: 'Demo expense' })
  await ensureExpense({ date: daysAgo(2), categoryId: categories['Site Measurement'].id, amount: 850, description: `${DEMO} – laser measurement visit for Joshi kitchen`, paymentMode: 'Cash', vendor: 'Field visit allowance', staffId: secondStaff.id, status: 'Approved', notes: 'Demo expense' })
  const recurring = await prisma.recurringExpense.findFirst({ where: { description: `${DEMO} – showroom internet and CRM` } })
  if (!recurring) await prisma.recurringExpense.create({ data: { categoryId: categories['Workshop Consumables'].id, description: `${DEMO} – showroom internet and CRM`, amount: 2499, paymentMode: 'Bank Transfer', vendor: 'Demo Broadband', frequency: 'Monthly', dayOfMonth: 5, startDate: new Date('2026-01-05'), isActive: true } })

  const cashDate = dayStart(1)
  await prisma.dailyCashRegister.upsert({ where: { date: cashDate }, update: { openingCash: 18000, closingCash: 21650, cashIn: 9500, cashOut: 5850, notes: `${DEMO}: daily counter closing` }, create: { date: cashDate, openingCash: 18000, closingCash: 21650, cashIn: 9500, cashOut: 5850, notes: `${DEMO}: daily counter closing` } })
  const dailyPayment = await prisma.dailyPayment.findUnique({ where: { displayId: 'DEMO-PAY-0001' } })
  if (!dailyPayment) await prisma.dailyPayment.create({ data: { displayId: 'DEMO-PAY-0001', amount: 12000, gstAmount: 1830, type: 'IN', method: 'UPI', reference: 'UPI-DEMO-RECEIPT-001', date: daysAgo(1), status: 'Reconciled', receivedByStaffId: staff.id } })

  const attendanceDate = dayStart(1)
  await prisma.attendance.upsert({ where: { staffId_date: { staffId: staff.id, date: attendanceDate } }, update: { clockIn: '09:18', clockOut: '18:42', hours: 9.4, status: 'Present', method: 'manual', isLate: true }, create: { staffId: staff.id, date: attendanceDate, clockIn: '09:18', clockOut: '18:42', hours: 9.4, status: 'Present', method: 'manual', isLate: true } })
  await prisma.attendance.upsert({ where: { staffId_date: { staffId: secondStaff.id, date: attendanceDate } }, update: { clockIn: '08:56', clockOut: '19:05', hours: 10.15, status: 'Present', method: 'manual', isLate: false }, create: { staffId: secondStaff.id, date: attendanceDate, clockIn: '08:56', clockOut: '19:05', hours: 10.15, status: 'Present', method: 'manual', isLate: false } })
  const activity = await prisma.staffActivity.findFirst({ where: { staffId: staff.id, text: { contains: DEMO } } })
  if (!activity) await prisma.staffActivity.create({ data: { staffId: staff.id, type: 'follow_up', text: `${DEMO}: sent shade options to Shah Residence`, time: '16:20', date: daysAgo(1) } })
  const existingFieldVisit = await prisma.fieldVisit.findFirst({ where: { displayId: 'DEMO-VISIT-0001' } })
  if (existingFieldVisit) {
    await prisma.fieldVisit.update({ where: { id: existingFieldVisit.id }, data: { status: 'Scheduled', scheduledDate: new Date(Date.now() + 86400000) } })
  } else {
    await prisma.fieldVisit.create({ data: { displayId: 'DEMO-VISIT-0001', staffId: secondStaff.id, customOrderId: customOrder.id, customer: contacts[2].name, address: contacts[2].address || 'Ahmedabad', date: daysAgo(1), time: '03:00 PM', scheduledDate: new Date(Date.now() + 86400000), scheduledTime: '03:00 PM - 04:00 PM', status: 'Scheduled', type: 'Measurement', notes: `${DEMO}: measure kitchen platform and verify cutouts`, measurements: { unit: 'ft', checklist: ['sink', 'hob', 'backsplash'] }, photoUrls: [] } })
  }

  const review = await prisma.review.findFirst({ where: { text: { contains: DEMO } } })
  if (!review) await prisma.review.create({ data: { contactId: contacts[0].id, customerName: contacts[0].name, rating: 5, text: `${DEMO}: Good guidance on tile quantity and matching grout. Delivery was on time.`, date: daysAgo(8), product: 'Calacatta Gold GVT 600x1200', platform: 'Google', replied: true } })
  const campaign = await prisma.campaign.findFirst({ where: { name: `${DEMO} – Monsoon Tile Refresh` } })
  if (!campaign) await prisma.campaign.create({ data: { name: `${DEMO} – Monsoon Tile Refresh`, channel: 'WhatsApp', status: 'SENT', scheduledDate: daysAgo(5), audience: 48, sent: 48, opened: 36, clicked: 14, template: 'Monsoon flooring consultation – free site measurement' } })

  const template = await prisma.emailTemplate.findFirst({ where: { name: `${DEMO} – Project Follow-up` } })
  const savedTemplate = template ?? await prisma.emailTemplate.create({ data: { name: `${DEMO} – Project Follow-up`, subject: 'Your TGM project follow-up', body: '<p>Hello {{customerName}},</p><p>Your tile and natural stone options are ready for review.</p>', category: 'Follow-up', variables: ['customerName', 'projectName'] } })
  const emailCampaign = await prisma.emailCampaign.findFirst({ where: { name: `${DEMO} – TGM Project Follow-up` } })
  if (!emailCampaign) await prisma.emailCampaign.create({ data: { name: `${DEMO} – TGM Project Follow-up`, subject: 'Your TGM project options are ready', body: '<p>Review your shortlisted tiles and marble options with our showroom team.</p>', templateId: savedTemplate.id, status: 'SENT', scheduledAt: daysAgo(4), sentAt: daysAgo(4), audience: 'leads', totalRecipients: 18, sent: 18, opened: 12, clicked: 5 } })
}

async function seedDealers(inventory: any, staff: any, secondStaff: any) {
  const dealerSpecs = [
    { key: 'shree', businessName: 'Shree Marbles & Tiles', contactPerson: 'Rajesh Mehta', phone: '+91 90000 41001', email: 'rajesh@shreemarbles.demo', gstNumber: '24AABCS4101F1Z2', city: 'Ahmedabad', state: 'Gujarat', territory: 'Ahmedabad West', dealerType: 'Retailer', status: 'ACTIVE', assignedStaffId: staff.id, creditLimit: 250000, creditDays: 30, monthly: 850000, categories: ['Tiles', 'Granite', 'Marble'], notes: `${DEMO}: long-term showroom partner with regular kitchen platform orders` },
    { key: 'urban', businessName: 'UrbanStone Distributors', contactPerson: 'Karan Shah', phone: '+91 90000 41002', email: 'buying@urbanstone.demo', gstNumber: '24AABCU4102F1Z8', city: 'Gandhinagar', state: 'Gujarat', territory: 'Gandhinagar', dealerType: 'Distributor', status: 'TRIAL_ORDER', assignedStaffId: secondStaff.id, creditLimit: 400000, creditDays: 21, monthly: 1200000, categories: ['Granite', 'Marble', 'Quartzite'], notes: `${DEMO}: evaluating natural stone range for two new counters` },
    { key: 'aravalli', businessName: 'Aravalli Ceramics', contactPerson: 'Priya Solanki', phone: '+91 90000 41003', email: 'priya@aravalliceramics.demo', gstNumber: '24AABCA4103F1Z6', city: 'Mehsana', state: 'Gujarat', territory: 'North Gujarat', dealerType: 'Retailer', status: 'PROSPECT', assignedStaffId: staff.id, creditLimit: 100000, creditDays: 15, monthly: 350000, categories: ['Tiles', 'Adhesive / Grout'], notes: `${DEMO}: prospect; asked for outdoor anti-skid and bathroom display samples` },
    { key: 'patel', businessName: 'Patel Buildmart', contactPerson: 'Nitin Patel', phone: '+91 90000 41004', email: 'purchase@patelbuildmart.demo', gstNumber: '24AABCP4104F1Z1', city: 'Bopal', state: 'Gujarat', territory: 'South-West Ahmedabad', dealerType: 'Project Partner', status: 'PRICE_LIST_SHARED', assignedStaffId: staff.id, creditLimit: 300000, creditDays: 30, monthly: 700000, categories: ['Tiles', 'Engineered Quartz'], notes: `${DEMO}: price list shared for three residential projects` },
    { key: 'nova', businessName: 'Nova Surfaces', contactPerson: 'Ayesha Khan', phone: '+91 90000 41005', email: 'ayesha@novasurfaces.demo', city: 'Vadodara', state: 'Gujarat', territory: 'Central Gujarat', dealerType: 'Architect', status: 'DORMANT', assignedStaffId: secondStaff.id, creditLimit: 150000, creditDays: 15, monthly: 420000, categories: ['Marble', 'Quartz'], notes: `${DEMO}: dormant for 75 days; needs a range refresh meeting` },
    { key: 'rajputana', businessName: 'Rajputana Stone House', contactPerson: 'Vikram Singh', phone: '+91 90000 41006', email: 'vikram@rajputanastone.demo', city: 'Kishangarh', state: 'Rajasthan', territory: 'Rajasthan', dealerType: 'Distributor', status: 'MEETING_SCHEDULED', assignedStaffId: secondStaff.id, creditLimit: 500000, creditDays: 30, monthly: 1600000, categories: ['Marble', 'Granite'], notes: `${DEMO}: meeting booked to review Makrana and Rajnagar lot availability` },
    { key: 'westline', businessName: 'Westline Projects', contactPerson: 'Neha Desai', phone: '+91 90000 41007', email: 'neha@westlineprojects.demo', city: 'Surat', state: 'Gujarat', territory: 'South Gujarat', dealerType: 'Contractor', status: 'CONTACTED', assignedStaffId: staff.id, creditLimit: 200000, creditDays: 20, monthly: 600000, categories: ['Tiles', 'Granite'], notes: `${DEMO}: contractor requested hotel lobby tile pricing and delivery lead time` },
    { key: 'omkar', businessName: 'Omkar Tile Studio', contactPerson: 'Suresh Yadav', phone: '+91 90000 41008', email: 'suresh@omkartilestudio.demo', city: 'Nadiad', state: 'Gujarat', territory: 'Kheda', dealerType: 'Retailer', status: 'NOT_INTERESTED', assignedStaffId: staff.id, creditLimit: 0, creditDays: 0, monthly: 0, categories: ['Tiles'], lostReason: 'Currently committed to an existing brand for the season', notes: `${DEMO}: closed after one follow-up; revisit next season` },
  ]
  const dealers: Record<string, any> = {}
  for (const spec of dealerSpecs) {
    const existing = await prisma.dealer.findFirst({ where: { phone: spec.phone } })
    dealers[spec.key] = existing
      ? await prisma.dealer.update({ where: { id: existing.id }, data: { businessName: spec.businessName, contactPerson: spec.contactPerson, phone: spec.phone, whatsappNumber: spec.phone, email: spec.email, gstNumber: spec.gstNumber || null, city: spec.city, state: spec.state, territory: spec.territory, dealerType: spec.dealerType, status: spec.status as any, assignedStaffId: spec.assignedStaffId, creditLimit: spec.creditLimit, creditDays: spec.creditDays, paymentTerms: spec.creditDays ? `${spec.creditDays} days from invoice date` : 'Advance / COD', estimatedMonthlyBusiness: spec.monthly, monthlySalesTarget: Math.round(spec.monthly * 0.75), performanceTier: spec.status === 'ACTIVE' ? 'A_GRADE' : spec.status === 'DORMANT' ? 'DORMANT' : spec.monthly >= 1000000 ? 'HIGH_POTENTIAL' : 'UNCLASSIFIED', preferredCategories: spec.categories, priceTier: spec.dealerType === 'Distributor' ? 'TRADE' : 'STANDARD', source: 'Field Visit', lostReason: spec.lostReason || null, notes: spec.notes } })
      : await prisma.dealer.create({ data: { businessName: spec.businessName, contactPerson: spec.contactPerson, phone: spec.phone, whatsappNumber: spec.phone, email: spec.email, gstNumber: spec.gstNumber || null, city: spec.city, state: spec.state, territory: spec.territory, dealerType: spec.dealerType, status: spec.status as any, assignedStaffId: spec.assignedStaffId, creditLimit: spec.creditLimit, creditDays: spec.creditDays, paymentTerms: spec.creditDays ? `${spec.creditDays} days from invoice date` : 'Advance / COD', estimatedMonthlyBusiness: spec.monthly, monthlySalesTarget: Math.round(spec.monthly * 0.75), performanceTier: spec.status === 'ACTIVE' ? 'A_GRADE' : spec.status === 'DORMANT' ? 'DORMANT' : spec.monthly >= 1000000 ? 'HIGH_POTENTIAL' : 'UNCLASSIFIED', preferredCategories: spec.categories, priceTier: spec.dealerType === 'Distributor' ? 'TRADE' : 'STANDARD', source: 'Field Visit', lastContactAt: daysAgo(spec.status === 'DORMANT' ? 75 : 2), nextFollowUpAt: spec.status === 'ACTIVE' || spec.status === 'NOT_INTERESTED' ? null : new Date(Date.now() + 3 * 86400000), lostReason: spec.lostReason || null, notes: spec.notes } })
    const activity = await prisma.dealerActivity.findFirst({ where: { dealerId: dealers[spec.key].id, title: `${DEMO}: dealer profile seeded` } })
    if (!activity) await prisma.dealerActivity.create({ data: { dealerId: dealers[spec.key].id, staffId: spec.assignedStaffId, type: 'DEMO', title: `${DEMO}: dealer profile seeded`, description: 'Demo partner record for workflow training', createdAt: daysAgo(3) } })
  }

  const teamSpecs = [
    { dealer: dealers.shree, assignments: [{ staffId: staff.id, role: 'OWNER' }, { staffId: secondStaff.id, role: 'COLLECTION_EXECUTIVE' }] },
    { dealer: dealers.urban, assignments: [{ staffId: secondStaff.id, role: 'OWNER' }, { staffId: staff.id, role: 'SUPPORT_PERSON' }] },
    { dealer: dealers.patel, assignments: [{ staffId: staff.id, role: 'OWNER' }, { staffId: secondStaff.id, role: 'REGIONAL_MANAGER' }] },
    { dealer: dealers.rajputana, assignments: [{ staffId: secondStaff.id, role: 'OWNER' }, { staffId: staff.id, role: 'SALESPERSON' }] },
  ]
  for (const spec of teamSpecs) {
    for (const assignment of spec.assignments) {
      await prisma.dealerStaffAssignment.upsert({
        where: { dealerId_staffId_role: { dealerId: spec.dealer.id, staffId: assignment.staffId, role: assignment.role } },
        update: {},
        create: { dealerId: spec.dealer.id, staffId: assignment.staffId, role: assignment.role },
      })
    }
  }

  const orderSpecs = [
    { id: 'DEMO-DO-0001', dealer: dealers.shree, status: 'DELIVERED', product: inventory.products['DEMO-GVT-600'], quantity: 32, rate: 1480, areaSqft: 496, amountPaid: 56218, orderDaysAgo: 18, notes: `${DEMO}: repeat GVT supply delivered to showroom partner` },
    { id: 'DEMO-DO-0002', dealer: dealers.urban, status: 'APPROVAL_PENDING', product: inventory.products['DEMO-GRN-BG'], quantity: 2, rate: 265, areaSqft: 250, amountPaid: 0, orderDaysAgo: 3, notes: `${DEMO}: trial Black Galaxy slab order awaiting credit approval` },
    { id: 'DEMO-DO-0003', dealer: dealers.patel, status: 'ALLOCATED', product: inventory.products['DEMO-MBL-MK'], quantity: 2, rate: 315, areaSqft: 235, amountPaid: 20000, orderDaysAgo: 6, notes: `${DEMO}: Makrana marble allocated after shade approval` },
    { id: 'DEMO-DO-0004', dealer: dealers.westline, status: 'DISPATCHED', product: inventory.products['DEMO-GVT-600'], quantity: 48, rate: 1480, areaSqft: 744, amountPaid: 30000, orderDaysAgo: 2, notes: `${DEMO}: hotel lobby tile consignment in transit` },
    { id: 'DEMO-DO-0005', dealer: dealers.rajputana, status: 'ENQUIRY', product: inventory.products['DEMO-QTZ-WH'], quantity: 4, rate: 560, areaSqft: 240, amountPaid: 0, orderDaysAgo: 1, notes: `${DEMO}: quartz range enquiry for dealer meeting` },
  ]
  for (const spec of orderSpecs) {
    const subtotal = Math.round(spec.quantity * spec.rate)
    const gst = Math.round(subtotal * 0.18)
    const freight = spec.status === 'DISPATCHED' ? 3500 : 1200
    const total = subtotal + gst + freight
    const estimatedCost = Math.round(spec.quantity * Number(spec.product.costPrice || 0))
    const marginAmount = subtotal - estimatedCost
    const marginPercent = subtotal > 0 ? Number(((marginAmount / subtotal) * 100).toFixed(2)) : 0
    const paymentDueDate = spec.dealer.creditDays ? new Date(daysAgo(spec.orderDaysAgo).getTime() + spec.dealer.creditDays * 86400000) : null
    const allocationNotes = ['ALLOCATED', 'DISPATCHED', 'DELIVERED'].includes(spec.status) ? `Demo allocation: ${spec.product.unitOfMeasure === 'SLAB' ? 'lot and slab selection confirmed' : 'batch and shade reservation confirmed'}` : null
    const existing = await prisma.dealerOrder.findUnique({ where: { displayId: spec.id } })
    const order = existing ?? await prisma.dealerOrder.create({ data: { displayId: spec.id, dealerId: spec.dealer.id, status: spec.status as any, orderDate: daysAgo(spec.orderDaysAgo), expectedDispatchDate: new Date(Date.now() + 5 * 86400000), paymentDueDate, dispatchDate: spec.status === 'DISPATCHED' || spec.status === 'DELIVERED' ? daysAgo(1) : null, deliveryDate: spec.status === 'DELIVERED' ? daysAgo(4) : null, subtotal, discount: 0, gst, freight, loading: 600, installation: 0, total, amountPaid: Math.min(spec.amountPaid, total), balanceDue: Math.max(0, total - Math.min(spec.amountPaid, total)), estimatedCost, marginAmount, marginPercent, paymentStatus: spec.amountPaid >= total ? 'PAID' : spec.amountPaid > 0 ? 'PARTIAL' : 'PENDING', salespersonId: spec.dealer.assignedStaffId, deliveryAddress: `${spec.dealer.businessName}, ${spec.dealer.city}`, allocationNotes, notes: spec.notes, items: { create: [{ productId: spec.product.id, name: spec.product.name, sku: spec.product.sku, quantity: spec.quantity, unitOfMeasure: spec.product.unitOfMeasure, areaSqft: spec.areaSqft, rate: spec.rate, amount: subtotal, costRate: Number(spec.product.costPrice || 0), marginAmount, shadeCode: spec.product.color, lotNumber: spec.product.unitOfMeasure === 'SLAB' ? 'DEMO-MK-2026-01' : null }] } } })
    if (existing) await prisma.dealerOrder.update({ where: { id: existing.id }, data: { status: spec.status as any, total, amountPaid: Math.min(spec.amountPaid, total), balanceDue: Math.max(0, total - Math.min(spec.amountPaid, total)), estimatedCost, marginAmount, marginPercent, paymentDueDate, allocationNotes, paymentStatus: spec.amountPaid >= total ? 'PAID' : spec.amountPaid > 0 ? 'PARTIAL' : 'PENDING', notes: spec.notes } })
    await prisma.dealerOrderItem.updateMany({ where: { orderId: order.id }, data: { costRate: Number(spec.product.costPrice || 0), marginAmount } })
    if (spec.amountPaid > 0 && order) {
      const reference = `${DEMO}-${spec.id}-ADVANCE`
      const payment = await prisma.dealerPayment.findFirst({ where: { reference } })
      if (!payment) await prisma.dealerPayment.create({ data: { dealerId: spec.dealer.id, dealerOrderId: order.id, amount: Math.min(spec.amountPaid, total), method: 'Bank Transfer', reference, paymentDate: daysAgo(Math.max(1, spec.orderDaysAgo - 1)), notes: `${DEMO}: dealer advance` } })
    }
  }

  const taskSpecs = [
    { dealer: dealers.urban, title: 'Confirm trial slab selection', type: 'CALL', priority: 'HIGH', due: 1, assignedStaffId: secondStaff.id },
    { dealer: dealers.aravalli, title: 'Share outdoor tile samples', type: 'CATALOGUE', priority: 'MEDIUM', due: 2, assignedStaffId: staff.id },
    { dealer: dealers.patel, title: 'Review project price list', type: 'MEETING', priority: 'HIGH', due: 3, assignedStaffId: staff.id },
    { dealer: dealers.nova, title: 'Re-activate dormant account', type: 'VISIT', priority: 'URGENT', due: 1, assignedStaffId: secondStaff.id },
    { dealer: dealers.rajputana, title: 'Prepare Makrana lot presentation', type: 'PRICE_LIST', priority: 'HIGH', due: 4, assignedStaffId: secondStaff.id },
    { dealer: dealers.shree, title: 'Collect delivered order balance', type: 'PAYMENT_COLLECTION', priority: 'MEDIUM', due: 5, assignedStaffId: staff.id },
  ]
  for (const task of taskSpecs) {
    const existing = await prisma.dealerTask.findFirst({ where: { dealerId: task.dealer.id, title: `${DEMO}: ${task.title}` } })
    if (!existing) await prisma.dealerTask.create({ data: { dealerId: task.dealer.id, assignedStaffId: task.assignedStaffId, type: task.type, title: `${DEMO}: ${task.title}`, description: 'Demo follow-up with a clear owner and due date.', dueDate: new Date(Date.now() + task.due * 86400000), reminderAt: new Date(Date.now() + Math.max(0, task.due - 1) * 86400000), priority: task.priority, status: task.dealer === dealers.shree ? 'IN_PROGRESS' : 'PENDING' } })
  }

  const visitSpecs = [
    { dealer: dealers.shree, purpose: 'Quarterly range review', personMet: 'Rajesh Mehta', outcome: 'Added Calacatta GVT and Black Galaxy to regular display range.', nextAction: 'Collect delivered order balance', staffId: staff.id, days: 7 },
    { dealer: dealers.nova, purpose: 'Reactivation visit', personMet: 'Ayesha Khan', outcome: 'Interested in engineered quartz samples for modular kitchen studios.', nextAction: 'Show Cloud White and new vein options', staffId: secondStaff.id, days: 12 },
    { dealer: dealers.rajputana, purpose: 'Natural stone partnership meeting', personMet: 'Vikram Singh', outcome: 'Meeting scheduled for Makrana and Rajnagar lot review.', nextAction: 'Prepare actual slab photos and rates', staffId: secondStaff.id, days: 1 },
  ]
  for (const visit of visitSpecs) {
    const exists = await prisma.dealerVisit.findFirst({ where: { dealerId: visit.dealer.id, purpose: `${DEMO}: ${visit.purpose}` } })
    const visitData = { dealerId: visit.dealer.id, staffId: visit.staffId, visitDate: daysAgo(visit.days), purpose: `${DEMO}: ${visit.purpose}`, personMet: visit.personMet, outcome: visit.outcome, samplesShown: visit.dealer === dealers.rajputana ? 'Makrana White and Rajnagar White physical samples' : 'Tile and stone display boards', priceListShared: true, dealerFeedback: 'Asked for lot-wise availability, lead time and dealer margin clarity.', nextAction: visit.nextAction, nextFollowUpAt: new Date(Date.now() + 4 * 86400000), nextMeetingAt: new Date(Date.now() + 5 * 86400000), notes: 'Demo visit record for training.' }
    if (exists) await prisma.dealerVisit.update({ where: { id: exists.id }, data: visitData })
    else await prisma.dealerVisit.create({ data: visitData })
  }

  const claimExists = await prisma.dealerClaim.findFirst({ where: { dealerId: dealers.westline.id, description: `${DEMO}: 2 boxes received with damaged corners` } })
  const claimData = { dealerId: dealers.westline.id, dealerOrderId: (await prisma.dealerOrder.findUnique({ where: { displayId: 'DEMO-DO-0004' }, select: { id: true } }))?.id, assignedStaffId: staff.id, type: 'TRANSIT_DAMAGE', description: `${DEMO}: 2 boxes received with damaged corners`, quantity: 2, claimAmount: 2960, status: 'UNDER_REVIEW' as any, replacementStatus: 'PENDING', replacementNotes: 'Replacement boxes to be dispatched after photo verification.', notes: 'Demo claim; photos awaited from dealer.' }
  if (claimExists) await prisma.dealerClaim.update({ where: { id: claimExists.id }, data: claimData })
  else await prisma.dealerClaim.create({ data: claimData })

  const priceListSpecs = [
    { name: `${DEMO} – TGM Trade Rates`, dealerId: null, items: [{ productId: inventory.products['DEMO-GVT-600'].id, rate: 1320, discountPct: 0, minQuantity: 10 }, { productId: inventory.products['DEMO-GRN-BG'].id, rate: 245, discountPct: 0, minQuantity: 2 }, { productId: inventory.products['DEMO-MBL-MK'].id, rate: 295, discountPct: 0, minQuantity: 2 }, { productId: inventory.products['DEMO-QTZ-WH'].id, rate: 525, discountPct: 0, minQuantity: 2 }] },
    { name: `${DEMO} – Shree Project Rates`, dealerId: dealers.shree.id, items: [{ productId: inventory.products['DEMO-GVT-600'].id, rate: 1280, discountPct: 0, minQuantity: 20 }, { productId: inventory.products['DEMO-GRN-BG'].id, rate: 235, discountPct: 0, minQuantity: 2 }] },
  ]
  for (const listSpec of priceListSpecs) {
    const existing = await prisma.dealerPriceList.findFirst({ where: { name: listSpec.name } })
    if (!existing) await prisma.dealerPriceList.create({ data: { name: listSpec.name, dealerId: listSpec.dealerId, validFrom: daysAgo(10), validUntil: new Date(Date.now() + 80 * 86400000), notes: `${DEMO}: trade pricing for demo workflow`, items: { create: listSpec.items } } })
  }
}

async function seedSocial(userId: string, contacts: any[]) {
  await prisma.waProfile.upsert({ where: { user_id: userId }, update: {}, create: { user_id: userId, full_name: 'TGM Demo Admin', email: 'admin@tilescrm.com', role: 'admin' } })

  const socialPeople = [
    { platform: 'whatsapp', name: 'Ananya Kapoor', phone: '+919100010001', handle: 'ananya.kapoor', message: 'Can you share Black Galaxy slab photos and today’s price?', reply: 'Yes, I will share the lot photos with size and available sq.ft.' },
    { platform: 'whatsapp', name: 'Vivek Sharma', phone: '+919100010002', handle: 'vivek.sharma', message: 'Need 600x1200 marble-look tiles for about 900 sq.ft.', reply: 'Please share the site city; I can prepare box quantity with 10% wastage.' },
    { platform: 'whatsapp', name: 'Pooja Nair', phone: '+919100010003', handle: 'pooja.nair', message: 'Is installation available for a kitchen platform?', reply: 'Yes. We can arrange measurement, cutting, polishing and installation.' },
    { platform: 'whatsapp', name: 'Harsh Vora', phone: '+919100010004', handle: 'harsh.vora', message: 'Please confirm whether the quotation includes loading.', reply: 'I will send a revised quote with loading, freight and installation shown separately.' },
    { platform: 'instagram', name: 'Riya Mehta', phone: '+919100010005', handle: '@riyamehta.interiors', message: 'Loved the white marble reel. Is this Makrana or imported?', reply: 'The display is Makrana White. I can also show Rajnagar and imported options.' },
    { platform: 'instagram', name: 'Studio Terra', phone: '+919100010006', handle: '@studioterra.design', message: 'Do you have book-match slabs for a feature wall?', reply: 'We have book-match pairs in selected lots; I will send the pair numbers.' },
    { platform: 'instagram', name: 'Kunal Bedi', phone: '+919100010007', handle: '@kunalbuilds', message: 'Can I visit the showroom on Saturday?', reply: 'Yes, I have reserved a 12:30 PM slot for your sample review.' },
    { platform: 'facebook', name: 'Neha Verma', phone: '+919100010008', handle: 'neha.verma.home', message: 'Which tile is safe for an open balcony during monsoon?', reply: 'Choose an outdoor anti-skid porcelain tile with R11/R12 grip.' },
    { platform: 'facebook', name: 'Amit Soni', phone: '+919100010009', handle: 'amit.soni', message: 'Do you deliver to Gandhinagar?', reply: 'Yes, we can arrange delivery. Freight depends on quantity and site access.' },
    { platform: 'facebook', name: 'The Build Desk', phone: '+919100010010', handle: 'thebuilddesk', message: 'Please send your trade pricing and slab inventory list.', reply: 'I will connect you with our sales manager for trade pricing and current lots.' },
    { platform: 'whatsapp', name: 'Samar Khan', phone: '+919100010011', handle: 'samar.khan', message: 'Can you quote 1,250 sq.ft of large-format tiles for a hotel lobby?', reply: 'Yes. Please share the city and required delivery date; we will check batch and freight.' },
    { platform: 'whatsapp', name: 'Ayesha Shah', phone: '+919100010012', handle: 'ayesha.shah', message: 'I need Rajnagar marble for a staircase. Can you share actual lot photos?', reply: 'Sure. I will share the available lot, slab sizes and fabrication estimate.' },
    { platform: 'instagram', name: 'Ayesha Living', phone: '+919100010013', handle: '@ayeshaliving', message: 'What edge profiles are available for a quartz waterfall island?', reply: 'We can do eased, pencil-round and laminated waterfall edges with a site template.' },
    { platform: 'instagram', name: 'BuildCraft Studio', phone: '+919100010014', handle: '@buildcraft.studio', message: 'Do you supply matching grout with your bathroom tile ranges?', reply: 'Yes. We can recommend epoxy or cement grout based on joint width and wet-area use.' },
    { platform: 'facebook', name: 'Rahul Bansal', phone: '+919100010015', handle: 'rahul.bansal.home', message: 'Can I get a site visit for measuring a terrace before choosing anti-skid tiles?', reply: 'Yes. I will arrange a measurement visit and note slope, drainage and area.' },
    { platform: 'facebook', name: 'Urban Nest Projects', phone: '+919100010016', handle: 'urban.nest.projects', message: 'Please send your contractor pricing and dispatch lead times.', reply: 'I will share our trade price sheet and current stock status with your project coordinator.' },
  ]
  const messageSets = socialPeople.map((person) => [person.message, person.reply, 'Thanks. Please also share the approximate area requirement and lead time.', 'Sure, I have noted it and will update the project quote today.'])

  for (let i = 0; i < socialPeople.length; i += 1) {
    const person = socialPeople[i]
    const messages = messageSets[i]
    if (person.platform === 'whatsapp') {
      const contact = await prisma.waContact.findFirst({ where: { user_id: userId, phone: person.phone } })
        ?? await prisma.waContact.create({ data: { user_id: userId, phone: person.phone, name: person.name, email: `${person.handle.replace(/[^a-z0-9]/gi, '').toLowerCase()}@demo-tgm.example` } })
      const conversation = await prisma.waConversation.upsert({ where: { user_id_contact_id: { user_id: userId, contact_id: contact.id } }, update: { status: 'open', needs_human: i === 3, last_message_text: messages[messages.length - 1], last_message_at: new Date(Date.now() - i * 3600000), unread_count: i % 3 === 0 ? 2 : 0 }, create: { user_id: userId, contact_id: contact.id, status: 'open', needs_human: i === 3, last_message_text: messages[messages.length - 1], last_message_at: new Date(Date.now() - i * 3600000), unread_count: i % 3 === 0 ? 2 : 0 } })
      await ensureSocialMessages(conversation.id, messages, 'whatsapp')
    } else {
      const contact = await prisma.socialContact.upsert({ where: { user_id_platform_platform_id: { user_id: userId, platform: person.platform, platform_id: `demo-${person.platform}-${String(i + 1).padStart(2, '0')}` } }, update: { name: person.name }, create: { user_id: userId, platform: person.platform, platform_id: `demo-${person.platform}-${String(i + 1).padStart(2, '0')}`, name: person.name, profile_pic: `https://i.pravatar.cc/160?img=${i + 18}` } })
      const conversation = await prisma.socialConversation.upsert({ where: { user_id_contact_id: { user_id: userId, contact_id: contact.id } }, update: { status: 'open', needs_human: i === 9, last_message_text: messages[messages.length - 1], last_message_at: new Date(Date.now() - i * 3600000), unread_count: i % 3 === 0 ? 2 : 0 }, create: { user_id: userId, contact_id: contact.id, platform: person.platform, status: 'open', needs_human: i === 9, last_message_text: messages[messages.length - 1], last_message_at: new Date(Date.now() - i * 3600000), unread_count: i % 3 === 0 ? 2 : 0 } })
      await ensureSocialMessages(conversation.id, messages, 'social')
    }
  }
}

async function seedWhatsappMarketing(userId: string) {
  const profile = await prisma.waProfile.upsert({
    where: { user_id: userId },
    update: { full_name: 'TGM Demo Admin', email: 'admin@tilescrm.com', role: 'admin' },
    create: { user_id: userId, full_name: 'TGM Demo Admin', email: 'admin@tilescrm.com', role: 'admin' },
  })

  const waContacts = await prisma.waContact.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
  })
  const contactByName = new Map(waContacts.map(contact => [contact.name || contact.phone, contact]))
  const conversationByContactId = new Map(
    (await prisma.waConversation.findMany({ where: { user_id: userId } })).map(conversation => [conversation.contact_id, conversation]),
  )

  const tagSpecs = [
    { name: `${DEMO} – Hot Lead`, color: '#dc2626' },
    { name: `${DEMO} – Contractor`, color: '#2563eb' },
    { name: `${DEMO} – Site Measurement`, color: '#16a34a' },
    { name: `${DEMO} – Follow-up Due`, color: '#d97706' },
  ]
  const tags: Record<string, any> = {}
  for (const spec of tagSpecs) {
    tags[spec.name] = await prisma.waTag.findFirst({ where: { user_id: userId, name: spec.name } })
      ?? await prisma.waTag.create({ data: { user_id: userId, name: spec.name, color: spec.color } })
  }

  const contactTags: Array<[string, string[]]> = [
    ['Ananya Kapoor', [tagSpecs[0].name, tagSpecs[2].name]],
    ['Samar Khan', [tagSpecs[1].name, tagSpecs[2].name]],
    ['Ayesha Shah', [tagSpecs[1].name]],
    ['Samar Khan', [tagSpecs[0].name, tagSpecs[1].name]],
    ['Vivek Sharma', [tagSpecs[2].name, tagSpecs[3].name]],
  ]
  for (const [name, tagNames] of contactTags) {
    const contact = contactByName.get(name)
    if (!contact) continue
    for (const tagName of tagNames) {
      const tag = tags[tagName]
      await prisma.waContactTag.upsert({
        where: { contact_id_tag_id: { contact_id: contact.id, tag_id: tag.id } },
        update: {},
        create: { contact_id: contact.id, tag_id: tag.id },
      })
    }
  }

  const noteSpecs = [
    ['Ananya Kapoor', 'Customer asked for actual Black Galaxy lot photos before approving the kitchen platform.'],
    ['Samar Khan', 'Commercial project: hotel lobby, approx. 1,250 sq.ft. Delivery target is month-end.'],
    ['Vivek Sharma', 'Terrace site visit requested. Confirm slope, drainage and anti-skid requirement.'],
  ]
  for (const [name, note] of noteSpecs) {
    const contact = contactByName.get(name)
    if (!contact) continue
    const exists = await prisma.waContactNote.findFirst({ where: { contact_id: contact.id, note_text: { contains: DEMO } } })
    if (!exists) await prisma.waContactNote.create({ data: { contact_id: contact.id, user_id: userId, note_text: `${DEMO}: ${note}` } })
  }

  const customFieldSpecs = [
    { field_name: `${DEMO} – Project Type`, field_type: 'select', field_options: ['Residential', 'Commercial', 'Hospitality'] },
    { field_name: `${DEMO} – Approx Area`, field_type: 'text', field_options: null },
  ]
  const customFields: Record<string, any> = {}
  for (const spec of customFieldSpecs) {
    customFields[spec.field_name] = await prisma.waCustomField.findFirst({ where: { user_id: userId, field_name: spec.field_name } })
      ?? await prisma.waCustomField.create({ data: { user_id: userId, field_name: spec.field_name, field_type: spec.field_type, field_options: spec.field_options || undefined } })
  }
  const customValues: Array<[string, string, string]> = [
    ['Ananya Kapoor', customFieldSpecs[0].field_name, 'Residential'],
    ['Samar Khan', customFieldSpecs[0].field_name, 'Hospitality'],
    ['Samar Khan', customFieldSpecs[1].field_name, '1,250 sq.ft'],
    ['Rahul Bansal', customFieldSpecs[1].field_name, '560 sq.ft'],
  ]
  for (const [name, fieldName, value] of customValues) {
    const contact = contactByName.get(name)
    const field = customFields[fieldName]
    if (!contact || !field) continue
    await prisma.waContactCustomValue.upsert({
      where: { contact_id_custom_field_id: { contact_id: contact.id, custom_field_id: field.id } },
      update: { value },
      create: { contact_id: contact.id, custom_field_id: field.id, value },
    })
  }

  const templateSpecs = [
    { name: `${DEMO.toLowerCase()}_site_measurement`, category: 'Utility', body_text: 'Hi {{1}}, your TGM site measurement request is noted for {{2}}. Our team will confirm the slot shortly.', footer_text: 'Tiles • Granite • Marble', buttons: [{ type: 'QUICK_REPLY', text: 'Confirm Slot' }] },
    { name: `${DEMO.toLowerCase()}_lot_options`, category: 'Marketing', body_text: 'Hello {{1}}, the latest {{2}} lot options are ready. We can share slab numbers, sizes and available sq.ft for your project.', footer_text: 'TGM Showroom', buttons: [{ type: 'QUICK_REPLY', text: 'Share Lots' }] },
    { name: `${DEMO.toLowerCase()}_quote_followup`, category: 'Marketing', body_text: 'Hi {{1}}, your quotation for {{2}} is ready. Reply here if you want us to revise quantity, freight or installation.', footer_text: 'TGM Sales Team', buttons: [{ type: 'QUICK_REPLY', text: 'Open Quote' }] },
    { name: `${DEMO.toLowerCase()}_delivery_update`, category: 'Utility', body_text: 'Update for {{1}}: your material dispatch is planned for {{2}}. We will share vehicle and delivery details once loaded.', footer_text: 'TGM Dispatch', buttons: [] },
  ]
  const templates: Record<string, any> = {}
  for (const spec of templateSpecs) {
    const existing = await prisma.waMessageTemplate.findFirst({ where: { user_id: userId, name: spec.name, language: 'en_US' } })
    templates[spec.name] = existing
      ? await prisma.waMessageTemplate.update({ where: { id: existing.id }, data: { category: spec.category, body_text: spec.body_text, footer_text: spec.footer_text, buttons: spec.buttons, status: 'Approved' } })
      : await prisma.waMessageTemplate.create({ data: { user_id: userId, name: spec.name, category: spec.category, language: 'en_US', body_text: spec.body_text, footer_text: spec.footer_text, buttons: spec.buttons, status: 'Approved' } })
  }

  const broadcastSpecs = [
    { name: `${DEMO} – Monsoon Anti-Skid Collection`, template: templateSpecs[1].name, status: 'sent', scheduledAt: daysAgo(3), contacts: ['Vivek Sharma', 'Ananya Kapoor', 'Pooja Nair', 'Samar Khan', 'Ayesha Shah'], delivered: 4, read: 3, replied: 2 },
    { name: `${DEMO} – Contractor Trade Price Update`, template: templateSpecs[2].name, status: 'sent', scheduledAt: daysAgo(1), contacts: ['Harsh Vora', 'Samar Khan', 'Ayesha Shah', 'Ananya Kapoor'], delivered: 3, read: 2, replied: 1 },
    { name: `${DEMO} – Saturday Showroom Visit Reminder`, template: templateSpecs[0].name, status: 'scheduled', scheduledAt: new Date(Date.now() + 2 * 86400000), contacts: ['Pooja Nair', 'Ayesha Shah', 'Samar Khan'], delivered: 0, read: 0, replied: 0 },
    { name: `${DEMO} – Rajnagar Marble Showcase`, template: templateSpecs[1].name, status: 'draft', scheduledAt: null, contacts: ['Ayesha Shah', 'Ananya Kapoor', 'Pooja Nair'], delivered: 0, read: 0, replied: 0 },
  ]
  for (const spec of broadcastSpecs) {
    const recipients = spec.contacts.map(name => contactByName.get(name)).filter(Boolean)
    const total = recipients.length
    const existing = await prisma.waBroadcast.findFirst({ where: { user_id: userId, name: spec.name } })
    const broadcast = existing
      ? await prisma.waBroadcast.update({ where: { id: existing.id }, data: { template_name: spec.template, template_language: 'en_US', scheduled_at: spec.scheduledAt, status: spec.status, total_recipients: total, sent_count: spec.status === 'sent' ? total : 0, delivered_count: spec.delivered, read_count: spec.read, replied_count: spec.replied, failed_count: 0 } })
      : await prisma.waBroadcast.create({ data: { user_id: userId, name: spec.name, template_name: spec.template, template_language: 'en_US', template_variables: { demo: true }, audience_filter: { source: 'TGM demo audience' }, scheduled_at: spec.scheduledAt, status: spec.status, total_recipients: total, sent_count: spec.status === 'sent' ? total : 0, delivered_count: spec.delivered, read_count: spec.read, replied_count: spec.replied, failed_count: 0 } })
    const recipientCount = await prisma.waBroadcastRecipient.count({ where: { broadcast_id: broadcast.id } })
    if (recipientCount !== recipients.length) {
      if (recipientCount > 0) await prisma.waBroadcastRecipient.deleteMany({ where: { broadcast_id: broadcast.id } })
    }
    if (recipients.length > 0 && (recipientCount === 0 || recipientCount !== recipients.length)) {
      const readLimit = spec.read
      const deliveredLimit = spec.delivered
      const repliedLimit = spec.replied
      await prisma.waBroadcastRecipient.createMany({
        data: recipients.map((contact: any, index) => {
          const status = index < repliedLimit ? 'replied' : index < readLimit ? 'read' : index < deliveredLimit ? 'delivered' : spec.status === 'sent' ? 'sent' : 'pending'
          return { broadcast_id: broadcast.id, contact_id: contact.id, status, sent_at: spec.status === 'sent' ? daysAgo(2) : null, delivered_at: ['replied', 'read', 'delivered'].includes(status) ? daysAgo(2) : null, read_at: ['replied', 'read'].includes(status) ? daysAgo(2) : null, replied_at: status === 'replied' ? daysAgo(1) : null, whatsapp_message_id: spec.status === 'sent' ? `${DEMO.toLowerCase()}-${broadcast.id}-${index + 1}` : null }
        }),
      })
    }
  }

  const pipelineName = `${DEMO} – TGM Sales Pipeline`
  const pipeline = await prisma.waPipeline.findFirst({ where: { user_id: userId, name: pipelineName } })
    ?? await prisma.waPipeline.create({ data: { user_id: userId, name: pipelineName } })
  const stageSpecs = [
    ['New Enquiry', '#3b82f6', 0],
    ['Qualified', '#eab308', 1],
    ['Quote Shared', '#f97316', 2],
    ['Site / Slab Approval', '#8b5cf6', 3],
    ['Won', '#22c55e', 4],
  ] as const
  const stages: Record<string, any> = {}
  for (const [name, color, position] of stageSpecs) {
    const existing = await prisma.waPipelineStage.findFirst({ where: { pipeline_id: pipeline.id, name } })
    stages[name] = existing
      ? await prisma.waPipelineStage.update({ where: { id: existing.id }, data: { color, position } })
      : await prisma.waPipelineStage.create({ data: { pipeline_id: pipeline.id, name, color, position } })
  }
  const dealSpecs = [
    { title: 'Samar Khan – Hotel Lobby Tile Supply', contact: 'Samar Khan', stage: 'Qualified', value: 412000, status: 'open', days: 18, notes: 'Confirm large-format porcelain batch and phased delivery.' },
    { title: 'Ananya Kapoor – Black Galaxy Kitchen', contact: 'Ananya Kapoor', stage: 'Site / Slab Approval', value: 78500, status: 'open', days: 9, notes: 'Waiting for sink and hob template approval.' },
    { title: 'Ayesha Shah – Quartz Waterfall Feature', contact: 'Ayesha Shah', stage: 'Quote Shared', value: 186000, status: 'open', days: 14, notes: 'Share quartz slab options, edge profile and installation lead time.' },
    { title: 'Vivek Sharma – Terrace Anti-skid Package', contact: 'Vivek Sharma', stage: 'New Enquiry', value: 132000, status: 'open', days: 21, notes: 'Measurement visit required before final quantity.' },
    { title: 'Harsh Vora – Rajnagar Staircase', contact: 'Harsh Vora', stage: 'Won', value: 248000, status: 'won', days: -4, notes: 'Demo won deal; dispatch after shade and edge approval.' },
  ]
  for (const spec of dealSpecs) {
    const contact = contactByName.get(spec.contact)
    if (!contact) continue
    const conversation = conversationByContactId.get(contact.id)
    const existing = await prisma.waDeal.findFirst({ where: { user_id: userId, pipeline_id: pipeline.id, title: spec.title } })
    const data = { stage_id: stages[spec.stage].id, contact_id: contact.id, conversation_id: conversation?.id || null, assigned_to: profile.id, value: spec.value, currency: 'INR', notes: `${DEMO}: ${spec.notes}`, expected_close_date: new Date(Date.now() + spec.days * 86400000), status: spec.status }
    if (existing) await prisma.waDeal.update({ where: { id: existing.id }, data })
    else await prisma.waDeal.create({ data: { user_id: userId, pipeline_id: pipeline.id, title: spec.title, ...data } })
  }

  const automationSpecs = [
    { name: `${DEMO} – New Enquiry Qualifier`, description: 'Ask for material, application and approximate area before assigning a TGM sales owner.', trigger_type: 'first_inbound_message', trigger_config: {}, execution_count: 9, steps: [{ step_type: 'send_message', step_config: { text: 'Thanks for contacting TGM. Which material do you need, what is the application, and approximately how many sq.ft?' }, position: 0 }, { step_type: 'add_tag', step_config: { tag_id: tags[tagSpecs[0].name].id }, position: 1 }] },
    { name: `${DEMO} – Quote Follow-up Reminder`, description: 'Nudge customers who received a quote but have not replied within 24 hours.', trigger_type: 'new_message_received', trigger_config: {}, execution_count: 6, steps: [{ step_type: 'wait', step_config: { amount: 1, unit: 'days' }, position: 0 }, { step_type: 'send_message', step_config: { text: 'Just checking in on the tile or stone options shared. Would you like actual lot photos, revised quantity or an installation estimate?' }, position: 1 }] },
  ]
  for (const spec of automationSpecs) {
    const existing = await prisma.waAutomation.findFirst({ where: { user_id: userId, name: spec.name } })
    const automation = existing
      ? await prisma.waAutomation.update({ where: { id: existing.id }, data: { description: spec.description, trigger_type: spec.trigger_type, trigger_config: spec.trigger_config, is_active: true, execution_count: spec.execution_count, last_executed_at: daysAgo(1) } })
      : await prisma.waAutomation.create({ data: { user_id: userId, name: spec.name, description: spec.description, trigger_type: spec.trigger_type, trigger_config: spec.trigger_config, is_active: true, execution_count: spec.execution_count, last_executed_at: daysAgo(1) } })
    const stepCount = await prisma.waAutomationStep.count({ where: { automation_id: automation.id } })
    if (stepCount === 0) await prisma.waAutomationStep.createMany({ data: spec.steps.map(step => ({ automation_id: automation.id, step_type: step.step_type, step_config: step.step_config, position: step.position })) })
    const logExists = await prisma.waAutomationLog.findFirst({ where: { automation_id: automation.id, trigger_event: { contains: DEMO } } })
    const logContact = contactByName.get(spec.name.includes('Qualifier') ? 'Samar Khan' : 'Ananya Kapoor')
    if (!logExists) await prisma.waAutomationLog.create({ data: { automation_id: automation.id, user_id: userId, contact_id: logContact?.id || null, trigger_event: `${DEMO}: inbound message`, steps_executed: spec.steps.map(step => step.step_type), status: 'success' } })
  }

  await prisma.waAgentConfig.upsert({
    where: { user_id: userId },
    update: { agent_name: 'TGM Stone & Tile Assistant', enabled: false, confidence_threshold: 0.55, languages: ['en', 'hi'] },
    create: { user_id: userId, agent_name: 'TGM Stone & Tile Assistant', enabled: false, system_prompt: 'You are a helpful TGM showroom assistant. Qualify tile, granite, marble and quartz enquiries by asking application, approximate area, city and timeline. Never invent live stock or final prices; ask the customer to confirm actual lot and slab availability with the sales team.', fallback_message: 'I will connect you with our TGM sales team to confirm the actual lot, price and delivery.', confidence_threshold: 0.55, max_response_tokens: 350, response_delay_ms: 1200, languages: ['en', 'hi'] },
  })
  const knowledgeDocs = [
    { title: `${DEMO} – TGM Product Guidance`, raw_text: 'TGM sells vitrified, ceramic, outdoor anti-skid and wood-finish tiles, plus granite, Indian marble, imported marble, engineered quartz, adhesive, grout and trims. Always ask application area, approximate sq.ft, preferred finish, city and timeline before recommending a product.' },
    { title: `${DEMO} – Stone Sales Rules`, raw_text: 'Granite and marble slabs are individually measured and sold by actual sq.ft. Confirm lot number, slab number, thickness, shade, finish and available area before promising stock. Fabrication, cutouts, edge profile, loading, freight, road permit and installation should be shown separately in the quotation.' },
  ]
  for (const docSpec of knowledgeDocs) {
    const existing = await prisma.waKnowledgeDoc.findFirst({ where: { user_id: userId, title: docSpec.title } })
    const doc = existing
      ? await prisma.waKnowledgeDoc.update({ where: { id: existing.id }, data: { raw_text: docSpec.raw_text, char_count: docSpec.raw_text.length, status: 'indexed', error: null } })
      : await prisma.waKnowledgeDoc.create({ data: { user_id: userId, title: docSpec.title, source_type: 'text', raw_text: docSpec.raw_text, char_count: docSpec.raw_text.length, status: 'indexed' } })
    const chunkCount = await prisma.waKnowledgeChunk.count({ where: { doc_id: doc.id } })
    if (chunkCount === 0) await prisma.waKnowledgeChunk.create({ data: { user_id: userId, doc_id: doc.id, chunk_index: 0, content: docSpec.raw_text } })
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use .env.tiles for the TGM database.')
  const admin = await prisma.user.findUnique({ where: { email: 'admin@tilescrm.com' } })
  if (!admin) throw new Error('TGM admin user not found. Run npm run db:seed:tiles first.')
  const staff = await ensureStaff({ email: 'sales.demo@tilescrm.com', name: 'Neel Shah', role: 'Sales Manager', phone: '+91 90000 30001', designation: 'Showroom Sales Manager', basicSalary: 42000 })
  const secondStaff = await ensureStaff({ email: 'fabrication.demo@tilescrm.com', name: 'Mihir Patel', role: 'Fabrication Coordinator', phone: '+91 90000 30002', designation: 'Stone Fabrication Coordinator', basicSalary: 38000 })
  const inventory = await seedInventory()
  const sales = await seedCustomersAndSales(inventory, staff, secondStaff)
  await seedOperations(inventory, sales.contacts, staff, secondStaff)
  await seedDealers(inventory, staff, secondStaff)
  await seedSocial(String(admin.id), sales.contacts)
  await seedWhatsappMarketing(String(admin.id))
  await prisma.channelConfig.upsert({ where: { channel: 'WhatsApp' }, update: {}, create: { channel: 'WhatsApp', enabled: false, config: {} } })
  await prisma.channelConfig.upsert({ where: { channel: 'Instagram' }, update: {}, create: { channel: 'Instagram', enabled: false, config: {} } })
  await prisma.channelConfig.upsert({ where: { channel: 'Facebook' }, update: {}, create: { channel: 'Facebook', enabled: false, config: {} } })
  console.log('✅ TGM demo data is ready (idempotent seed).')
  console.log('   16 CRM contacts, 9 leads, 8 walk-ins, 3 quotations, 3 invoices, fabrication + expense + staff demo data')
  console.log('   8 dealers, 5 dealer orders, tasks, visits, claim and price lists')
  console.log('   16 social people: 6 WhatsApp, 5 Instagram, 5 Facebook; each has a four-message chat')
  console.log('   WhatsApp Marketing: templates, broadcasts, tags, contacts, pipeline deals, automations and AI knowledge docs')
  console.log('   Product and slab photos use local SKU-matched TGM catalog assets.')
}

main().catch((error) => {
  console.error('❌ Demo seed failed:', error)
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect()
  await pool.end()
})
