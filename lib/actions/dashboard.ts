'use server'

import { prisma } from '@/lib/db'
import { subDays, startOfDay, endOfDay, format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────

export interface ExecutiveKPIs {
  revenue: {
    today: number
    thisWeek: number
    thisMonth: number
    lastMonth: number
    yoyGrowth: number
  }
  pipeline: {
    totalValue: number
    dealsCount: number
    avgDealSize: number
    conversionRate: number
  }
  cash: {
    receivables: number
    payables: number
    cashRegister: number
    netCash: number
  }
  conversion: {
    leadsToContacts: number
    contactsToQuotes: number
    quotesToOrders: number
    overall: number
  }
  alerts: {
    critical: number
    warning: number
    info: number
  }
}

export interface RevenueTrendPoint {
  period: string
  revenue: number
  previousPeriod?: number
}

export interface PipelineVelocity {
  stage: string
  count: number
  value: number
  avgDaysInStage: number
  conversionRate: number
}

export interface CashPosition {
  receivables: {
    total: number
    overdue: number
    byAge: { bucket: string; amount: number }[]
  }
  payables: {
    total: number
    dueSoon: number
    byAge: { bucket: string; amount: number }[]
  }
  cashRegister: {
    openingBalance: number
    cashIn: number
    cashOut: number
    closingBalance: number
    date: string
  }
  netCash: number
}

export interface ConversionFunnel {
  stage: string
  count: number
  conversionFromPrevious: number
  conversionFromStart: number
}

export interface ActiveAlert {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  currentValue: number
  severity: 'critical' | 'warning' | 'info'
  message: string
  triggeredAt: Date
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getDateRange(timeRange: 'today' | 'week' | 'month' | 'quarter' | 'year'): { start: Date; end: Date } {
  const now = new Date()
  const end = endOfDay(now)
  let start: Date

  switch (timeRange) {
    case 'today':
      start = startOfDay(now)
      break
    case 'week':
      start = startOfDay(subDays(now, 7))
      break
    case 'month':
      start = startOfDay(subDays(now, 30))
      break
    case 'quarter':
      start = startOfDay(subDays(now, 90))
      break
    case 'year':
      start = startOfDay(subDays(now, 365))
      break
  }
  return { start, end }
}

async function getPreviousPeriodRevenue(start: Date, end: Date): Promise<number> {
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const prevStart = subDays(start, daysDiff)
  const prevEnd = subDays(start, 1)

  const prevRevenue = await prisma.payment.aggregate({
    where: { date: { gte: prevStart, lte: prevEnd } },
    _sum: { amount: true }
  })
  return prevRevenue._sum?.amount || 0
}

// ─── Server Actions ───────────────────────────────────────────────────────

export async function getExecutiveKPIs(timeRange: 'today' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<ExecutiveKPIs> {
  const { start, end } = getDateRange(timeRange)

  // Revenue metrics
  const [todayRevenue, weekRevenue, monthRevenue, lastMonthRevenue, prevMonthRevenue] = await Promise.all([
    prisma.payment.aggregate({
      where: { date: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } },
      _sum: { amount: true }
    }),
    prisma.payment.aggregate({
      where: { date: { gte: startOfDay(subDays(new Date(), 7)), lte: endOfDay(new Date()) } },
      _sum: { amount: true }
    }),
    prisma.payment.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true }
    }),
    prisma.payment.aggregate({
      where: {
        date: {
          gte: startOfDay(subDays(new Date(), 30)),
          lte: endOfDay(subDays(new Date(), 1))
        }
      },
      _sum: { amount: true }
    }),
    getPreviousPeriodRevenue(start, end)
  ])

  // Pipeline metrics (using Quotations as pipeline proxy)
  const [activeQuotes, allQuotes] = await Promise.all([
    prisma.quotation.findMany({
      where: { status: { in: ['DRAFT', 'SENT'] } },
      select: { grandTotal: true }
    }),
    prisma.quotation.count({ where: { createdAt: { gte: start, lte: end } } })
  ])

  const pipelineValue = activeQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0)
  const avgDealSize = activeQuotes.length > 0 ? pipelineValue / activeQuotes.length : 0

  // Lead conversion funnel
  const [totalLeads, contactedLeads, quotesCreated, ordersCreated] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.lead.count({ where: { status: { in: ['CONTACTED', 'SHOWROOM_VISIT', 'QUOTATION', 'WON'] }, createdAt: { gte: start, lte: end } } }),
    prisma.quotation.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.order.count({ where: { date: { gte: start, lte: end } } })
  ])

  const leadsToContacts = totalLeads > 0 ? (contactedLeads / totalLeads) * 100 : 0
  const contactsToQuotes = contactedLeads > 0 ? (quotesCreated / contactedLeads) * 100 : 0
  const quotesToOrders = quotesCreated > 0 ? (ordersCreated / quotesCreated) * 100 : 0
  const overallConversion = totalLeads > 0 ? (ordersCreated / totalLeads) * 100 : 0

  // Cash position
  const [unpaidInvoices, cashRegisterToday] = await Promise.all([
    prisma.invoice.aggregate({
      where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
      _sum: { balanceDue: true }
    }),
    prisma.dailyCashRegister.findUnique({
      where: { date: startOfDay(new Date()) }
    })
  ])

  const receivables = unpaidInvoices._sum?.balanceDue || 0
  const cashRegisterBalance = cashRegisterToday?.closingCash ?? cashRegisterToday?.openingCash ?? 0

  // Alerts from AlertRule evaluation
  const activeAlerts = await getActiveAlerts()

  return {
    revenue: {
      today: todayRevenue._sum?.amount || 0,
      thisWeek: weekRevenue._sum?.amount || 0,
      thisMonth: monthRevenue._sum?.amount || 0,
      lastMonth: lastMonthRevenue._sum?.amount || 0,
      yoyGrowth: prevMonthRevenue > 0 ? ((monthRevenue._sum?.amount || 0) - prevMonthRevenue) / prevMonthRevenue * 100 : 0
    },
    pipeline: {
      totalValue: pipelineValue,
      dealsCount: activeQuotes.length,
      avgDealSize,
      conversionRate: overallConversion
    },
    cash: {
      receivables,
      payables: 0, // TODO: implement payables from purchase orders
      cashRegister: cashRegisterBalance,
      netCash: cashRegisterBalance - receivables
    },
    conversion: {
      leadsToContacts: Math.round(leadsToContacts * 10) / 10,
      contactsToQuotes: Math.round(contactsToQuotes * 10) / 10,
      quotesToOrders: Math.round(quotesToOrders * 10) / 10,
      overall: Math.round(overallConversion * 10) / 10
    },
    alerts: {
      critical: activeAlerts.filter(a => a.severity === 'critical').length,
      warning: activeAlerts.filter(a => a.severity === 'warning').length,
      info: activeAlerts.filter(a => a.severity === 'info').length
    }
  }
}

export async function getRevenueTrend(
  timeRange: 'today' | 'week' | 'month' | 'quarter' | 'year' = 'month',
  granularity: 'day' | 'week' | 'month' = 'day'
): Promise<RevenueTrendPoint[]> {
  const { start, end } = getDateRange(timeRange)

  let periods: Date[]
  let formatStr: string

  switch (granularity) {
    case 'day':
      periods = eachDayOfInterval({ start, end })
      formatStr = 'MMM d'
      break
    case 'week':
      periods = eachWeekOfInterval({ start, end })
      formatStr = 'w'
      break
    case 'month':
      periods = eachMonthOfInterval({ start, end })
      formatStr = 'MMM yyyy'
      break
  }

  const payments = await prisma.payment.findMany({
    where: { date: { gte: start, lte: end } },
    select: { amount: true, date: true }
  })

  const paymentsByPeriod = new Map<string, number>()
  for (const p of payments) {
    const key = format(p.date, formatStr)
    paymentsByPeriod.set(key, (paymentsByPeriod.get(key) || 0) + p.amount)
  }

  // Get previous period for comparison
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const prevStart = subDays(start, daysDiff)
  const prevEnd = subDays(start, 1)

  const prevPayments = await prisma.payment.findMany({
    where: { date: { gte: prevStart, lte: prevEnd } },
    select: { amount: true, date: true }
  })

  const prevPaymentsByPeriod = new Map<string, number>()
  for (const p of prevPayments) {
    const key = format(p.date, formatStr)
    prevPaymentsByPeriod.set(key, (prevPaymentsByPeriod.get(key) || 0) + p.amount)
  }

  return periods.map(period => ({
    period: format(period, formatStr),
    revenue: paymentsByPeriod.get(format(period, formatStr)) || 0,
    previousPeriod: prevPaymentsByPeriod.get(format(period, formatStr))
  }))
}

export async function getPipelineVelocity(timeRange: 'today' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<PipelineVelocity[]> {
  const { start, end } = getDateRange(timeRange)

  // Quotation stages as pipeline stages
  const stages = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED'] as const

  const results = await Promise.all(
    stages.map(async (stage) => {
      const quotes = await prisma.quotation.findMany({
        where: {
          status: stage,
          createdAt: { gte: start, lte: end }
        },
        select: { grandTotal: true, createdAt: true, updatedAt: true }
      })

      const count = quotes.length
      const value = quotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0)
      const avgDaysInStage = quotes.length > 0
        ? quotes.reduce((sum, q) => sum + (q.updatedAt.getTime() - q.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) / quotes.length
        : 0

      // Conversion rate: percentage that moved to next stage
      let conversionRate = 0
      if (stage !== 'REJECTED') {
        const nextStageIndex = stages.indexOf(stage) + 1
        if (nextStageIndex < stages.length) {
          const nextStageQuotes = await prisma.quotation.count({
            where: {
              status: stages[nextStageIndex],
              createdAt: { gte: start, lte: end }
            }
          })
          conversionRate = count > 0 ? (nextStageQuotes / count) * 100 : 0
        }
      }

      return {
        stage,
        count,
        value,
        avgDaysInStage: Math.round(avgDaysInStage * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10
      }
    })
  )

  return results
}

export async function getCashPosition(): Promise<CashPosition> {
  const today = startOfDay(new Date())

  // Receivables (unpaid invoices)
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
    select: { balanceDue: true, dueDate: true, date: true }
  })

  const totalReceivables = unpaidInvoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0)
  const overdue = unpaidInvoices
    .filter(inv => inv.dueDate && inv.dueDate < today)
    .reduce((sum, inv) => sum + (inv.balanceDue || 0), 0)

  // Aging buckets
  const agingBuckets = [
    { bucket: 'Current', amount: 0 },
    { bucket: '1-30 days', amount: 0 },
    { bucket: '31-60 days', amount: 0 },
    { bucket: '61-90 days', amount: 0 },
    { bucket: '90+ days', amount: 0 }
  ]

  for (const inv of unpaidInvoices) {
    if (!inv.dueDate) continue
    const daysOverdue = Math.floor((today.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysOverdue <= 0) agingBuckets[0].amount += inv.balanceDue || 0
    else if (daysOverdue <= 30) agingBuckets[1].amount += inv.balanceDue || 0
    else if (daysOverdue <= 60) agingBuckets[2].amount += inv.balanceDue || 0
    else if (daysOverdue <= 90) agingBuckets[3].amount += inv.balanceDue || 0
    else agingBuckets[4].amount += inv.balanceDue || 0
  }

  // Payables - from purchase orders
  const unpaidPOs = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] } },
    select: { balanceDue: true, expectedDate: true }
  })

  const totalPayables = unpaidPOs.reduce((sum, po) => sum + (po.balanceDue || 0), 0)
  const dueSoon = unpaidPOs
    .filter(po => po.expectedDate && po.expectedDate <= subDays(today, -7))
    .reduce((sum, po) => sum + (po.balanceDue || 0), 0)

  const payableAging = [
    { bucket: 'Current', amount: 0 },
    { bucket: '1-30 days', amount: 0 },
    { bucket: '31-60 days', amount: 0 },
    { bucket: '61-90 days', amount: 0 },
    { bucket: '90+ days', amount: 0 }
  ]

  for (const po of unpaidPOs) {
    if (!po.expectedDate) continue
    const daysUntilDue = Math.floor((po.expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilDue <= 0) payableAging[0].amount += po.balanceDue || 0
    else if (daysUntilDue <= 30) payableAging[1].amount += po.balanceDue || 0
    else if (daysUntilDue <= 60) payableAging[2].amount += po.balanceDue || 0
    else if (daysUntilDue <= 90) payableAging[3].amount += po.balanceDue || 0
    else payableAging[4].amount += po.balanceDue || 0
  }

  // Cash register
  const cashRegister = await prisma.dailyCashRegister.findUnique({
    where: { date: today }
  })

  const openingBalance = cashRegister?.openingCash || 0
  const cashIn = await prisma.dailyPayment.aggregate({
    where: { date: { gte: today, lte: endOfDay(new Date()) }, type: 'IN' },
    _sum: { amount: true }
  })
  const cashOut = await prisma.dailyPayment.aggregate({
    where: { date: { gte: today, lte: endOfDay(new Date()) }, type: 'OUT' },
    _sum: { amount: true }
  })

  const closingBalance = (cashRegister?.closingCash ?? openingBalance + (cashIn._sum?.amount || 0) - (cashOut._sum?.amount || 0))

  return {
    receivables: {
      total: totalReceivables,
      overdue,
      byAge: agingBuckets
    },
    payables: {
      total: totalPayables,
      dueSoon,
      byAge: payableAging
    },
    cashRegister: {
      openingBalance,
      cashIn: cashIn._sum?.amount || 0,
      cashOut: cashOut._sum?.amount || 0,
      closingBalance,
      date: format(today, 'yyyy-MM-dd')
    },
    netCash: closingBalance + totalReceivables - totalPayables
  }
}

export async function getConversionFunnel(timeRange: 'today' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<ConversionFunnel[]> {
  const { start, end } = getDateRange(timeRange)

  const stages = [
    { key: 'leads', label: 'Leads', query: prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }) },
    { key: 'contacted', label: 'Contacted', query: prisma.lead.count({ where: { status: { in: ['CONTACTED', 'SHOWROOM_VISIT', 'QUOTATION', 'WON'] }, createdAt: { gte: start, lte: end } } }) },
    { key: 'quotes', label: 'Quotations', query: prisma.quotation.count({ where: { createdAt: { gte: start, lte: end } } }) },
    { key: 'orders', label: 'Orders', query: prisma.order.count({ where: { date: { gte: start, lte: end } } }) }
  ] as const

  const counts = await Promise.all(stages.map(s => s.query))

  return stages.map((stage, i) => {
    const count = counts[i]
    const prevCount = i > 0 ? counts[i - 1] : count
    const startCount = counts[0]

    return {
      stage: stage.label,
      count,
      conversionFromPrevious: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 0,
      conversionFromStart: startCount > 0 ? Math.round((count / startCount) * 1000) / 10 : 0
    }
  })
}

export async function getActiveAlerts(): Promise<ActiveAlert[]> {
  const rules = await prisma.alertRule.findMany({
    where: { isActive: true }
  })

  const alerts: ActiveAlert[] = []

  for (const rule of rules) {
    // Check cooldown
    if (rule.lastTriggered) {
      const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMins * 60 * 1000)
      if (cooldownEnd > new Date()) continue
    }

    let currentValue = 0
    let shouldTrigger = false

    // Evaluate metric based on rule.metric
    switch (rule.metric) {
      case 'unpaid_invoices':
        const unpaid = await prisma.invoice.aggregate({
          where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
          _sum: { balanceDue: true }
        })
        currentValue = unpaid._sum?.balanceDue || 0
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break

      case 'overdue_invoices':
        const overdue = await prisma.invoice.count({
          where: {
            paymentStatus: { in: ['PENDING', 'PARTIAL'] },
            dueDate: { lt: new Date() }
          }
        })
        currentValue = overdue
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break

      case 'low_stock':
        const lowStockProducts = await prisma.product.findMany({
          where: { reorderLevel: { gt: 0 } },
          select: { stock: true, reorderLevel: true }
        })
        currentValue = lowStockProducts.filter(p => p.stock < p.reorderLevel).length
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break

      case 'sla_breach_rate':
        const totalSLAs = await prisma.ticketSLA.count()
        const breachedSLAs = await prisma.ticketSLA.count({
          where: { OR: [{ breachedFirstResponse: true }, { breachedResolution: true }] }
        })
        currentValue = totalSLAs > 0 ? (breachedSLAs / totalSLAs) * 100 : 0
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break

      case 'daily_revenue':
        const todayRevenue = await prisma.payment.aggregate({
          where: { date: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } },
          _sum: { amount: true }
        })
        currentValue = todayRevenue._sum?.amount || 0
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break

      case 'new_leads':
        const newLeads = await prisma.lead.count({
          where: { createdAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } }
        })
        currentValue = newLeads
        shouldTrigger = evaluateCondition(currentValue, rule.operator, rule.threshold)
        break
    }

    if (shouldTrigger) {
      alerts.push({
        id: rule.id,
        name: rule.name,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        currentValue,
        severity: rule.severity as 'critical' | 'warning' | 'info',
        message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.operator} ${rule.threshold})`,
        triggeredAt: new Date()
      })

      // Update lastTriggered
      await prisma.alertRule.update({
        where: { id: rule.id },
        data: { lastTriggered: new Date() }
      })
    }
  }

  return alerts
}

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold
    case '>=': return value >= threshold
    case '<': return value < threshold
    case '<=': return value <= threshold
    case '=': return value === threshold
    case '!=': return value !== threshold
    default: return false
  }
}

// WS subscription helper - returns channel names for client to subscribe
export async function subscribeToKPIUpdates(userId: number, widgets: string[]): Promise<string[]> {
  const channels = ['kpi_updates']
  if (widgets.includes('revenue')) channels.push('revenue_updates')
  if (widgets.includes('pipeline')) channels.push('pipeline_updates')
  if (widgets.includes('cash')) channels.push('cash_updates')
  if (widgets.includes('alerts')) channels.push('alert_updates')
  return channels
}