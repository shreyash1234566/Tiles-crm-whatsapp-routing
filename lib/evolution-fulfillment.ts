import type { EvolutionInquiryStage, UserRole } from '@prisma/client'
import { allowedEvolutionStageTransitions } from './evolution-operations'

export type WorkflowActor = {
  role: UserRole | string
  routingDepartmentName?: string | null
}

const SALES_STAGES = new Set<EvolutionInquiryStage>([
  'TRIAGED', 'WORKING', 'QUOTATION', 'WAITING_FOR_DEALER', 'CONFIRMED',
  'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED',
])
const ACCOUNTS_STAGES = new Set<EvolutionInquiryStage>(['PAYMENT_PENDING', 'ON_HOLD', 'ESCALATED'])
const WAREHOUSE_STAGES = new Set<EvolutionInquiryStage>(['ALLOCATED', 'DISPATCH_PENDING', 'ON_HOLD', 'ESCALATED'])
const LOGISTICS_STAGES = new Set<EvolutionInquiryStage>(['DISPATCHED', 'DELIVERED', 'ON_HOLD', 'ESCALATED'])

export function isWorkflowManager(actor: WorkflowActor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'MANAGER'
}

export function normalizedDepartmentName(name: string | null | undefined): string {
  return String(name || '').trim().toLowerCase().replace(/[^a-z]/g, '')
}

/** Restrict lifecycle mutations by responsibility; managers retain override. */
export function canMoveEvolutionStage(actor: WorkflowActor, to: EvolutionInquiryStage): boolean {
  if (isWorkflowManager(actor)) return true
  if (actor.role !== 'STAFF') return false
  const department = normalizedDepartmentName(actor.routingDepartmentName)
  if (department === 'sales') return SALES_STAGES.has(to)
  if (department === 'accounts' || department === 'account') return ACCOUNTS_STAGES.has(to)
  if (department === 'warehouse' || department === 'godown') return WAREHOUSE_STAGES.has(to)
  if (department === 'logistics' || department === 'logistic') return LOGISTICS_STAGES.has(to)
  return false
}

export function canPerformFulfillmentAction(actor: WorkflowActor, action: 'payment_verified' | 'allocate' | 'dispatch' | 'deliver' | 'link_invoice'): boolean {
  if (isWorkflowManager(actor)) return true
  if (actor.role !== 'STAFF') return false
  const department = normalizedDepartmentName(actor.routingDepartmentName)
  if (action === 'payment_verified') return department === 'accounts' || department === 'account'
  if (action === 'allocate') return department === 'warehouse' || department === 'godown'
  if (action === 'dispatch' || action === 'deliver') return department === 'logistics' || department === 'logistic'
  return department === 'accounts' || department === 'account'
}

const ACTION_ONLY_STAGES = new Set<EvolutionInquiryStage>(['ALLOCATED', 'DISPATCHED', 'DELIVERED'])

export function allowedFulfillmentTransitions(
  actor: WorkflowActor,
  from: EvolutionInquiryStage,
  context: { hasOrder: boolean; isPricedOrder?: boolean; orderStatus?: string | null; hasActiveAllocation?: boolean },
): EvolutionInquiryStage[] {
  return allowedEvolutionStageTransitions(from).filter((stage) => {
    if (!canMoveEvolutionStage(actor, stage) || ACTION_ONLY_STAGES.has(stage)) return false
    if (stage === 'PAYMENT_PENDING' && (!context.hasOrder || context.isPricedOrder !== true)) return false
    if (stage === 'DISPATCH_PENDING') return context.hasOrder && context.orderStatus === 'ALLOCATED' && context.hasActiveAllocation === true
    return true
  })
}

export function isPricedFulfillmentOrder(order: { total?: number | null; items?: Array<{ productId?: number | null; quantity?: number | null; rate?: number | null; amount?: number | null }> } | null | undefined): boolean {
  return Boolean(order && Number(order.total) > 0 && order.items?.length && order.items.every((item) => item.productId && Number(item.quantity) > 0 && Number(item.rate) > 0 && Number(item.amount) > 0))
}

export function hasApprovedDealerCredit(input: { creditDays?: number | null; creditLimit?: number | null; balanceDue?: number | null }): boolean {
  const days = Number(input.creditDays || 0)
  const limit = Number(input.creditLimit || 0)
  const balance = Number(input.balanceDue || 0)
  return days > 0 && limit > 0 && balance > 0 && balance <= limit
}

function calendarDay(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000)
}

export function dispatchCountdown(expectedDispatchDate: Date | string | null | undefined, now = new Date(), timeZone = process.env.EVOLUTION_OPERATIONS_TIMEZONE || 'Asia/Kolkata') {
  if (!expectedDispatchDate) return { state: 'UNSCHEDULED' as const, daysRemaining: null, label: 'Dispatch date not committed' }
  const due = new Date(expectedDispatchDate)
  if (Number.isNaN(due.getTime())) return { state: 'UNSCHEDULED' as const, daysRemaining: null, label: 'Dispatch date not committed' }
  let daysRemaining: number
  try {
    daysRemaining = calendarDay(due, timeZone) - calendarDay(now, timeZone)
  } catch {
    daysRemaining = calendarDay(due, 'UTC') - calendarDay(now, 'UTC')
  }
  if (daysRemaining < 0) return { state: 'OVERDUE' as const, daysRemaining, label: `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} overdue` }
  if (daysRemaining === 0) return { state: 'DUE_TODAY' as const, daysRemaining, label: 'Due today' }
  return { state: 'UPCOMING' as const, daysRemaining, label: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining` }
}

export function isUsableReceipt(file: { size?: number; type?: string; name?: string } | null | undefined): boolean {
  if (!file || !Number.isFinite(file.size) || (file.size || 0) <= 0 || (file.size || 0) > 25 * 1024 * 1024) return false
  const type = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  return type.startsWith('image/') || type === 'application/pdf' || /\.(pdf|jpe?g|png|webp)$/i.test(name)
}
