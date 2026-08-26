export type EvolutionInboxUser = {
  id?: string | number | null
  role?: string | null
  routingDepartmentId?: number | null
}

export type DepartmentScopedWorkItem = {
  departmentId: number | null
  assignedUserId?: number | null
  claimedByUserId?: number | null
}

export const WORK_ITEM_STATUS = {
  ACTIVE: 'ACTIVE',
  DONE: 'DONE',
} as const

export function isRoutingManager(user: EvolutionInboxUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER'
}

// This is deliberately department-based instead of group-based. A group is a
// shared external channel; it must never grant staff access to another
// department's responsibility or transcript.
export function canAccessDepartmentWorkItem(user: EvolutionInboxUser, item: DepartmentScopedWorkItem): boolean {
  if (isRoutingManager(user)) return true
  return user.role === 'STAFF'
    && Number.isInteger(user.routingDepartmentId)
    && item.departmentId === user.routingDepartmentId
}

export function workItemRecipientIds(
  users: Array<{ id: number; role: string; routingDepartmentId: number | null }>,
  departmentId: number | null,
  directAssigneeId?: number | null,
): number[] {
  const recipients = new Set<number>()
  for (const user of users) {
    if (user.role === 'ADMIN' || user.role === 'MANAGER' || (departmentId != null && user.routingDepartmentId === departmentId)) {
      recipients.add(user.id)
    }
  }
  // A direct mention cannot bypass department isolation. It only adds a user
  // who is already a manager or belongs to the routed department.
  if (directAssigneeId != null) {
    const assignee = users.find((user) => user.id === directAssigneeId)
    if (assignee && (assignee.role === 'ADMIN' || assignee.role === 'MANAGER' || assignee.routingDepartmentId === departmentId)) {
      recipients.add(directAssigneeId)
    }
  }
  return [...recipients]
}

export function normalizeWorkItemFilter(value: string | null): 'active' | 'done' | 'history' | 'all' {
  if (value === 'done' || value === 'history' || value === 'all') return value
  return 'active'
}
