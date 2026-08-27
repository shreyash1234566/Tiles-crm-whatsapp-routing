import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'
import { dispatchCountdown } from '@/lib/evolution-fulfillment'

const FULFILLMENT_STAGES = ['PAYMENT_PENDING', 'ALLOCATED', 'DISPATCH_PENDING', 'DISPATCHED', 'DELIVERED'] as const

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerUserId = await getEvolutionOwnerUserId()
  if (!ownerUserId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })

  const inquiries = await prisma.evolutionDealerInquiry.findMany({
    where: {
      ownerUserId,
      stage: { in: [...FULFILLMENT_STAGES] },
      convertedOrderId: { not: null },
      ...(session.user.role === 'STAFF'
        ? { ticket: { is: { workItems: { some: { departmentId: session.user.routingDepartmentId ?? -1 } } } } }
        : {}),
    },
    include: {
      dealer: { select: { id: true, businessName: true, contactPerson: true, city: true, state: true } },
      ticket: { select: { id: true, group: { select: { id: true, subject: true } } } },
      convertedOrder: { include: { fulfillmentGodown: { select: { id: true, name: true } } } },
    },
    orderBy: { lastActivityAt: 'desc' },
    take: 500,
  })
  const rows = inquiries.map((inquiry) => ({
    inquiryId: inquiry.id,
    stage: inquiry.stage,
    group: inquiry.ticket?.group || null,
    dealer: inquiry.dealer,
    order: inquiry.convertedOrder ? { ...inquiry.convertedOrder, countdown: dispatchCountdown(inquiry.convertedOrder.expectedDispatchDate) } : null,
  }))
  const now = new Date()
  const totals = {
    paymentPending: rows.filter((row) => row.stage === 'PAYMENT_PENDING').length,
    allocated: rows.filter((row) => row.stage === 'ALLOCATED').length,
    dispatchPending: rows.filter((row) => row.stage === 'DISPATCH_PENDING').length,
    dispatched: rows.filter((row) => row.stage === 'DISPATCHED').length,
    due1: rows.filter((row) => row.order?.expectedDispatchDate && new Date(row.order.expectedDispatchDate).getTime() - now.getTime() <= 24 * 60 * 60 * 1000 && new Date(row.order.expectedDispatchDate).getTime() >= now.getTime()).length,
    due3: rows.filter((row) => row.order?.expectedDispatchDate && new Date(row.order.expectedDispatchDate).getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000 && new Date(row.order.expectedDispatchDate).getTime() >= now.getTime()).length,
    due7: rows.filter((row) => row.order?.expectedDispatchDate && new Date(row.order.expectedDispatchDate).getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000 && new Date(row.order.expectedDispatchDate).getTime() >= now.getTime()).length,
    overdueDispatch: rows.filter((row) => row.stage !== 'DISPATCHED' && row.stage !== 'DELIVERED' && row.order?.countdown.state === 'OVERDUE').length,
    missingReceipt: rows.filter((row) => row.stage === 'DISPATCHED' && !row.order?.logisticReceiptUrl).length,
  }
  return NextResponse.json({ data: { rows, totals } })
}
