/**
 * lib/brand.ts — Brand_Config
 *
 * Single vertical-aware source of truth for brand identity.
 *
 * The shared CRM serves two verticals selected by the `BUSINESS_TYPE`
 * environment variable:
 *   - `furniture` → the existing "Furzentic" brand (the default)
 *   - `tiles`     → the "Homzentic" tiles, granite & marble brand
 *
 * Everything brand-related (app metadata, favicon, logo/contact rendering,
 * WhatsApp templates, upload-dir naming, terminology) derives from the
 * Active_Vertical resolved here. When the vertical is `furniture`, every
 * value is byte-for-byte identical to the pre-rebrand strings so the
 * furniture experience is unchanged.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 13.2
 */

// ─── Types ────────────────────────────────────────────────────────────

/** A business configuration of the CRM. */
export type Vertical = 'furniture' | 'tiles'

/** The visual theme key associated with a vertical. */
export type ThemeKey = 'furniture' | 'homzentic'

/** Support / contact block exposed for a brand. */
export interface BrandSupport {
    phone: string
    altPhone?: string
    email: string
    website: string
    address: string
}

/** The complete set of brand identity values for a vertical. */
export interface BrandIdentity {
    vertical: Vertical
    /** Display brand name, e.g. "Furzentic" | "Homzentic". */
    name: string
    /** Short brand name for compact surfaces. */
    shortName: string
    /** Document `<title>`. */
    title: string
    /** Meta description. */
    description: string
    /** Marketing tagline. */
    tagline: string
    /** Public asset path to the logo. */
    logo: string
    /** Favicon path. */
    favicon: string
    /** Theme key used for design-token scoping. */
    themeKey: ThemeKey
    /**
     * Value for the root `data-brand` attribute.
     * `null` for furniture so the attribute is omitted entirely
     * (the furniture palette is the default and unscoped).
     */
    brandAttribute: ThemeKey | null
    /** Support / contact details. */
    support: BrandSupport
}

// ─── Brand identities ─────────────────────────────────────────────────

/**
 * Furniture ("Furzentic") identity.
 *
 * These values are the exact current strings so the furniture vertical
 * renders identically before and after the rebrand (Requirement 13.1).
 *   - title/description match `app/layout.js`
 *   - support contacts match the WhatsApp templates
 */
const FURNITURE_BRAND: BrandIdentity = {
    vertical: 'furniture',
    name: 'Furzentic',
    shortName: 'Furzentic',
    title: 'Furzentic — Smart Store Manager',
    description:
        'AI-powered CRM for furniture stores. Manage leads, appointments, inventory, orders, marketing, and more.',
    tagline: 'Smart Store Manager',
    logo: '/logo.png',
    favicon: '/favicon.ico',
    themeKey: 'furniture',
    brandAttribute: null,
    support: {
        phone: '+91 7004642914',
        altPhone: '+91 9199987067',
        email: 'info@kosmicfurniture.com',
        website: 'kosmicfurniture.com',
        address: 'Nalanda, Bihar',
    },
}

/**
 * Tiles ("Homzentic") identity — the combined tiles, granite & marble
 * showroom vertical.
 */
const TILES_BRAND: BrandIdentity = {
    vertical: 'tiles',
    name: 'Homzentic',
    shortName: 'Homzentic',
    title: 'Homzentic — Smart Showroom Manager',
    description:
        'AI-powered CRM for tiles, granite & marble showrooms. Manage leads, lots, slabs, fabrication jobs, quotations, and more.',
    tagline: 'Smart Showroom Manager',
    logo: '/logo.png',
    favicon: '/favicon.ico',
    themeKey: 'homzentic',
    brandAttribute: 'homzentic',
    support: {
        phone: '+91 7004642914',
        altPhone: '+91 9199987067',
        email: 'info@homzentic.com',
        website: 'homzentic.com',
        address: 'Nalanda, Bihar',
    },
}

const BRANDS: Record<Vertical, BrandIdentity> = {
    furniture: FURNITURE_BRAND,
    tiles: TILES_BRAND,
}

// ─── Resolution ───────────────────────────────────────────────────────

/**
 * Resolve a vertical from a raw env value.
 *
 * Trims and lowercases the input and returns `'tiles'` only on an exact
 * match; every other value (unset, empty, mixed-case noise, unrecognized)
 * resolves to `'furniture'`. This function never throws.
 *
 * Requirements: 1.4, 13.2
 */
export function resolveVertical(raw?: string | null): Vertical {
    return typeof raw === 'string' && raw.trim().toLowerCase() === 'furniture'
        ? 'furniture'
        : 'tiles'
}

/**
 * Active vertical resolved from the environment.
 *
 * Reads the server-only `BUSINESS_TYPE` first, falling back to the
 * client-exposed `NEXT_PUBLIC_BUSINESS_TYPE` so server components, client
 * components, server actions, and CLI/seed all resolve consistently.
 *
 * Requirements: 1.6
 */
export function getActiveVertical(): Vertical {
    return resolveVertical(
        process.env.BUSINESS_TYPE ?? process.env.NEXT_PUBLIC_BUSINESS_TYPE,
    )
}

/**
 * Brand identity for the given vertical, or the Active_Vertical when no
 * vertical is supplied.
 *
 * Requirements: 1.1, 1.2, 1.3
 */
export function getBrand(vertical?: Vertical): BrandIdentity {
    const resolved = vertical ?? getActiveVertical()
    return BRANDS[resolved]
}
