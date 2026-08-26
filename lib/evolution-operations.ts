import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { normalizeJid, normalizePhoneJid } from '@/lib/evolution-routing'

export const CLOSED_INQUIRY_STAGES = new Set([
  'CLOSED',
  'LOST',
  'CANCELLED',
])

export function isClosedInquiryStage(stage: string | null | undefined): boolean {
  return CLOSED_INQUIRY_STAGES.has(String(stage || '').toUpperCase())
}

const STAGE_TRANSITIONS: Record<string, string[]> = {
  NEW: ['TRIAGED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'],
  TRIAGED: ['WORKING', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'],
  WORKING: ['QUOTATION', 'WAITING_FOR_DEALER', 'CONFIRMED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'],
  QUOTATION: ['WAITING_FOR_DEALER', 'CONFIRMED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'],
  WAITING_FOR_DEALER: ['WORKING', 'CONFIRMED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'],
  CONFIRMED: ['PAYMENT_PENDING', 'ALLOCATED', 'ON_HOLD', 'ESCALATED', 'CANCELLED'],
  PAYMENT_PENDING: ['ALLOCATED', 'ON_HOLD', 'ESCALATED', 'CANCELLED'],
  ALLOCATED: ['DISPATCH_PENDING', 'ON_HOLD', 'ESCALATED', 'CANCELLED'],
  DISPATCH_PENDING: ['DISPATCHED', 'ON_HOLD', 'ESCALATED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'ESCALATED'],
  DELIVERED: ['CLOSED'],
  ON_HOLD: ['TRIAGED', 'WORKING', 'WAITING_FOR_DEALER', 'ESCALATED', 'LOST', 'CANCELLED'],
  ESCALATED: ['TRIAGED', 'WORKING', 'ON_HOLD', 'LOST', 'CANCELLED'],
  CLOSED: [],
  LOST: [],
  CANCELLED: [],
}

export function isValidEvolutionStageTransition(from: string, to: string): boolean {
  return (STAGE_TRANSITIONS[String(from).toUpperCase()] || []).includes(String(to).toUpperCase())
}

export function isEvolutionInquiryStage(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(STAGE_TRANSITIONS, String(value).toUpperCase())
}

/**
 * Normalise Indian/international WhatsApp numbers without assuming a specific
 * display format in CRM data. We only compare phone values after this step.
 */
export function normalizeEvolutionPhone(value: string | null | undefined): string {
  return normalizePhoneJid(value)
}

export function evolutionPhoneCandidates(value: string | null | undefined): string[] {
  const digits = normalizeEvolutionPhone(value)
  if (!digits) return []

  const candidates = new Set([digits, `+${digits}`])
  // Most dealer records in this CRM use Indian mobile numbers. Preserve the
  // full E.164 number while also considering a locally stored 10-digit value.
  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2)
    candidates.add(local)
    candidates.add(`+91${local}`)
  }
  return [...candidates]
}

export type DealerMatch = {
  dealerId: number
  matchedPhone: string
  source: 'identity' | 'dealer_phone'
} | null

/**
 * Resolve a dealer only from an explicit saved identity or an unambiguous
 * phone match. Unknown senders intentionally remain unlinked for Admin review;
 * the CRM must never silently create an end-customer record in this B2B flow.
 */
export async function findDealerForEvolutionMessage(input: {
  userId: number
  groupJid: string
  senderJid: string
}): Promise<DealerMatch> {
  const groupJid = normalizeJid(input.groupJid)
  const phone = normalizeEvolutionPhone(input.senderJid)

  const groupIdentity = await prisma.dealerEvolutionIdentity.findUnique({
    where: { userId_groupJid: { userId: input.userId, groupJid } },
    select: { dealerId: true, phone: true },
  })
  if (groupIdentity) {
    return {
      dealerId: groupIdentity.dealerId,
      matchedPhone: normalizeEvolutionPhone(groupIdentity.phone || phone),
      source: 'identity',
    }
  }

  if (!phone) return null
  const candidates = evolutionPhoneCandidates(phone)
  const dealers = await prisma.dealer.findMany({
    where: {
      OR: [
        { phone: { in: candidates } },
        { alternatePhone: { in: candidates } },
        { whatsappNumber: { in: candidates } },
      ],
    },
    select: { id: true, phone: true, alternatePhone: true, whatsappNumber: true },
    take: 3,
  })

  const exactMatches = dealers.filter((dealer) =>
    [dealer.phone, dealer.alternatePhone, dealer.whatsappNumber]
      .filter((candidate): candidate is string => Boolean(candidate))
      .some((candidate) => normalizeEvolutionPhone(candidate) === phone),
  )
  if (exactMatches.length !== 1) return null

  return { dealerId: exactMatches[0].id, matchedPhone: phone, source: 'dealer_phone' }
}

export function agentAllowsGroup(config: {
  allowedGroupJids: string[]
  allowedDepartmentIds: number[]
}, groupJid: string, departmentId: number | null | undefined): boolean {
  const groupAllowlist = (config.allowedGroupJids || []).map(normalizeJid).filter(Boolean)
  const departmentAllowlist = config.allowedDepartmentIds || []
  const groupAllowed = groupAllowlist.length === 0 || groupAllowlist.includes(normalizeJid(groupJid))
  const departmentAllowed = departmentAllowlist.length === 0 || (departmentId != null && departmentAllowlist.includes(departmentId))
  return groupAllowed && departmentAllowed
}

export function automaticEvolutionRepliesEnabled(): boolean {
  return process.env.EVOLUTION_AGENT_ALLOW_AUTOSEND?.trim().toLowerCase() === 'true'
}

export function newIdempotencyKey(prefix: string, stableValue: string): string {
  return `${prefix}:${stableValue || randomUUID()}`
}
