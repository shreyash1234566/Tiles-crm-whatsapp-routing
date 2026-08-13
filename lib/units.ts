/**
 * Shared area and pricing helpers for tile and stone transactions.
 * `areaSqft` is the CRM's canonical measured-area field, even when the
 * selling rate is expressed per square metre.
 */

export const SQFT_PER_SQM = 10.763910416709722

export function getBillableArea(
  areaSqft: number | null | undefined,
  quantity: number,
  unitOfMeasure: string | null | undefined,
) {
  const unit = String(unitOfMeasure || 'PCS').toUpperCase()
  const area = Math.max(0, Number(areaSqft) || 0)
  const qty = Math.max(1, Number(quantity) || 1)

  if (unit === 'SQM') {
    // The stored/UI area is square feet; convert it to square metres for a
    // per-SQM rate. If no measured area was entered, quantity is already in
    // the selling UOM and must not be converted a second time.
    return area > 0 ? area / SQFT_PER_SQM : qty
  }

  if (unit === 'SQFT' || unit === 'SLAB') return area > 0 ? area : qty
  return qty
}
