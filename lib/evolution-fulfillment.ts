import type { EvolutionInquiryStage, UserRole } from '@prisma/client'

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

export function dispatchCountdown(expectedDispatchDate: Date | string | null | undefined, now = new Date()) {
  if (!expectedDispatchDate) return { state: 'UNSCHEDULED' as const, daysRemaining: null, label: 'Dispatch date not committed' }
  const due = new Date(expectedDispatchDate)
  if (Number.isNaN(due.getTime())) return { state: 'UNSCHEDULED' as const, daysRemaining: null, label: 'Dispatch date not committed' }
  const localStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const daysRemaining = Math.round((dueStart - localStart) / 86_400_000)
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
