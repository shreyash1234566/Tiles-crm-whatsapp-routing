import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/redis'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Fetch all active alert rules
    const rules = await prisma.alertRule.findMany({
      where: { isActive: true }
    })

    const results: any[] = []

    for (const rule of rules) {
      try {
        // Evaluate the rule's metric
        const metricValue = await evaluateMetric(rule.metric, rule.metric)
        const triggered = checkThreshold(metricValue, rule.threshold, rule.operator)

        const existingAlert = await prisma.alert.findFirst({
          where: {
            ruleId: rule.id,
            resolvedAt: null
          }
        })

        if (triggered && !existingAlert) {
          // Create new alert
          const alert = await prisma.alert.create({
            data: {
              ruleId: rule.id,
              metric: rule.metric,
              value: metricValue,
              severity: rule.severity,
              message: buildAlertMessage(rule, metricValue)
            }
          })

          // Publish real-time event
          await publishEvent('chat_events', {
            type: 'alert_triggered',
            userId: 'system',
            userIds: ['admin'], // Will be refined to notify managers
            conversationId: `alert-${alert.id}`,
            payload: alert
          })

          results.push({ ruleId: rule.id, action: 'triggered', alertId: alert.id })
        } else if (!triggered && existingAlert) {
          // Resolve existing alert
          await prisma.alert.update({
            where: { id: existingAlert.id },
            data: { resolvedAt: now }
          })

          // Publish real-time event
          await publishEvent('chat_events', {
            type: 'alert_resolved',
            userId: 'system',
            userIds: ['admin'],
            conversationId: `alert-${existingAlert.id}`,
            payload: { id: existingAlert.id, ruleId: rule.id }
          })

          results.push({ ruleId: rule.id, action: 'resolved', alertId: existingAlert.id })
        } else {
          results.push({ ruleId: rule.id, action: 'no_change' })
        }
      } catch (err) {
        console.error(`Error evaluating rule ${rule.id}:`, err)
        results.push({ ruleId: rule.id, action: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error evaluating alerts:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

async function evaluateMetric(
  metric: string,
  conditions: any
): Promise<number> {
  const { start, end } = getTimeRange(conditions?.timeRange || 'today')

  switch (metric) {
    case 'revenue':
      const rev = await prisma.payment.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true }
      })
      return rev._sum?.amount || 0

    case 'active_tickets':
      return await prisma.evolutionGroupTicket.count({
        where: { status: 'open' }
      })

    case 'new_leads':
      return await prisma.lead.count({
        where: { createdAt: { gte: start, lte: end } }
      })

    case 'conversion_rate':
      const [leads, orders] = await Promise.all([
        prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma.order.count({ where: { createdAt: { gte: start, lte: end } } })
      ])
      return leads > 0 ? (orders / leads) * 100 : 0

    case 'cash_position':
      const [receivables, payables] = await Promise.all([
        prisma.invoice.aggregate({
          where: { paymentStatus: 'PENDING' },
          _sum: { balanceDue: true }
        }),
        prisma.purchaseOrder.aggregate({
          where: { status: 'APPROVED' },
          _sum: { total: true }
        })
      ])
      return (receivables._sum?.balanceDue || 0) - (payables._sum?.total || 0)

    case 'sla_breach_rate':
      const [breached, total] = await Promise.all([
        prisma.ticketSLA.count({
          where: {
            OR: [{ breachedFirstResponse: true }, { breachedResolution: true }],
            createdAt: { gte: start, lte: end }
          }
        }),
        prisma.ticketSLA.count({
          where: { createdAt: { gte: start, lte: end } }
        })
      ])
      return total > 0 ? (breached / total) * 100 : 0

    default:
      return 0
  }
}

function checkThreshold(value: number, threshold: number, operator: string): boolean {
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

function buildAlertMessage(rule: any, value: number): string {
  const opLabel = {
    '>': 'exceeded',
    '>=': 'met or exceeded',
    '<': 'fell below',
    '<=': 'met or fell below',
    '=': 'equals',
    '!=': 'does not equal'
  }[rule.operator] || 'triggered'

  return `${rule.name}: ${rule.metric} ${opLabel} ${rule.threshold} (current: ${value.toFixed(2)})`
}

function getTimeRange(range: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  let start = new Date(now)

  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      break
    case 'week':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0)
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  }

  return { start, end }
}