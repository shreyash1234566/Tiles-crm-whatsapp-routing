export type EvolutionMetricMessage = {
  fromMe: boolean
  createdAt: Date | string
}

/**
 * Measure the first real outbound response after the first inbound message in
 * an inquiry. Stored ticket timestamps can be stale after imports, retries or
 * old deployments, so dashboard reporting is derived from the message audit.
 */
export function firstResponseMinutes(openedAt: Date | string, messages: EvolutionMetricMessage[]): number | null {
  const opened = new Date(openedAt).getTime()
  if (!Number.isFinite(opened)) return null
  const ordered = messages
    .map((message) => ({ ...message, timestamp: new Date(message.createdAt).getTime() }))
    .filter((message) => Number.isFinite(message.timestamp) && message.timestamp >= opened)
    .sort((a, b) => a.timestamp - b.timestamp)
  const firstInbound = ordered.find((message) => !message.fromMe)
  if (!firstInbound) return null
  const firstOutbound = ordered.find((message) => message.fromMe && message.timestamp >= firstInbound.timestamp)
  if (!firstOutbound) return null
  return Math.max(0, (firstOutbound.timestamp - firstInbound.timestamp) / 60_000)
}

export function isConvertedEvolutionInquiry(inquiry: { convertedOrderId?: number | null }): boolean {
  return Number.isInteger(inquiry.convertedOrderId) && Number(inquiry.convertedOrderId) > 0
}

/** Return the statistical median without mutating the caller's array. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return Math.round(value)
}
