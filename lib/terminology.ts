/**
 * lib/terminology.ts — Terminology_Set
 *
 * Vertical-aware, user-facing labels for shared UI concepts.
 *
 * The CRM serves two verticals (`furniture` → "Furzentic", `tiles` →
 * "Homzentic"). Some UI copy should read differently per vertical
 * (e.g. a tiles showroom talks about a "catalog" and "design
 * consultation"), while most labels are shared.
 *
 * Resolution model (Requirement 9.1, 9.4):
 *   1. If the Active_Vertical defines an override for the key → use it.
 *   2. Otherwise → fall back to the SHARED default label.
 *
 * The SHARED defaults are the existing furniture-facing labels, and the
 * furniture override map is intentionally empty, so the furniture
 * vertical renders its terminology unchanged (Requirement 9.3). The tiles
 * override map supplies tiles & sanitary copy for showroom, design
 * consultation, and catalog concepts (Requirement 9.2).
 *
 * Vertical resolution is reused from `lib/brand.ts` so all modules agree
 * on the Active_Vertical.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { getActiveVertical, type Vertical } from './brand'

// ─── Keys ─────────────────────────────────────────────────────────────

/**
 * The set of vertical-specific concept keys the UI can resolve a label
 * for. Every key has a SHARED default; verticals may override a subset.
 */
export type TermKey =
    // Showroom concept
    | 'showroom'
    | 'showroomVisit'
    | 'walkIn'
    // Design consultation concept
    | 'designConsultation'
    | 'consultation'
    | 'consultant'
    // Catalog concept
    | 'catalog'
    | 'catalogItem'
    // Product concept
    | 'product'
    | 'products'

// ─── Shared defaults ──────────────────────────────────────────────────

/**
 * Shared default labels used for both verticals unless a vertical
 * provides an override. These match the existing furniture-facing copy
 * so the furniture vertical is unchanged (Requirement 9.3, 9.4).
 */
const SHARED: Record<TermKey, string> = {
    showroom: 'Store',
    showroomVisit: 'Store Visit',
    walkIn: 'Walk-in',
    designConsultation: 'Consultation',
    consultation: 'Consultation',
    consultant: 'Consultant',
    catalog: 'Products',
    catalogItem: 'Product',
    product: 'Product',
    products: 'Products',
}

// ─── Per-vertical overrides ───────────────────────────────────────────

/**
 * Per-vertical label overrides.
 *
 * - `furniture`: empty — furniture uses the SHARED defaults verbatim so
 *   its terminology is unchanged (Requirement 9.3).
 * - `tiles`: tiles & sanitary terminology for showroom, design
 *   consultation, and catalog concepts (Requirement 9.2).
 */
const OVERRIDES: Record<Vertical, Partial<Record<TermKey, string>>> = {
    furniture: {},
    tiles: {
        showroom: 'Showroom',
        showroomVisit: 'Showroom Visit',
        walkIn: 'Showroom Visit',
        designConsultation: 'Design Consultation',
        consultation: 'Design Consultation',
        consultant: 'Design Consultant',
        catalog: 'Catalog',
        catalogItem: 'Catalog Item',
    },
}

// ─── Resolution ───────────────────────────────────────────────────────

/**
 * Resolve a user-facing label for a concept key.
 *
 * Returns the Active_Vertical's (or the explicitly supplied vertical's)
 * override when one is defined, otherwise the shared default. Because
 * every known key has a SHARED default, this never returns `undefined`
 * for a known key (Requirement 9.1, 9.4).
 *
 * @param key      The concept key to resolve.
 * @param vertical Optional explicit vertical; defaults to the
 *                 Active_Vertical resolved from the environment.
 */
export function getTerm(key: TermKey, vertical?: Vertical): string {
    const resolved = vertical ?? getActiveVertical()
    return OVERRIDES[resolved][key] ?? SHARED[key]
}
