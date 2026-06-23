"use client"

import dynamic from "next/dynamic"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Code-split entry points for the heavy / animated vendored components.
 *
 * Performance-budget rationale (Requirement 16):
 *  - 16.3  Heavy or animated Modern_Components are loaded through a code-split
 *          dynamic `import()` so their JS is NOT part of the initial route
 *          payload — it is fetched only when the component first renders.
 *  - 16.6  Any future JS animation runtime (e.g. `motion`) pulled in by one of
 *          these components rides along in that split chunk, so it never leaks
 *          into routes that don't use the component.
 *
 * Import the lazy variant when a heavy/animated component sits below the fold,
 * behind an interaction, or on a route where it is not the primary content:
 *
 *   import { LazySpotlightCard } from "@/components/ui/lazy"
 *
 * Import the component directly from its own module only when it is critical,
 * above-the-fold content that must be in the first paint.
 *
 * NOTE: `Skeleton` (Server Component, pure-CSS `animate-pulse`) and `Spinner`
 * (pure-CSS `animate-spin`) are intentionally NOT code-split here — they are
 * tiny, dependency-light loading primitives that are frequently needed
 * synchronously (often as the fallback for these very imports), so splitting
 * them would add a network round-trip with no payload benefit.
 */

/**
 * SpotlightCard is a Client Component (it tracks the pointer to drive a
 * CSS-variable spotlight). Code-split so the pointer-tracking logic is not in
 * the initial bundle. `ssr: false` skips server rendering of a purely
 * decorative, interaction-driven surface; a token-themed Skeleton holds layout
 * until the chunk loads.
 */
export const LazySpotlightCard = dynamic(
    () => import("@/components/ui/spotlight-card").then((m) => m.SpotlightCard),
    {
        ssr: false,
        loading: () => <Skeleton className="h-32 w-full rounded-xl" />,
    }
)

/**
 * ShimmerButton carries an animated (CSS) sheen and a @base-ui/react Button
 * primitive. Code-split so its styles/JS load on demand. SSR stays on so the
 * button is present and clickable in the server-rendered HTML; the CSS shimmer
 * is suppressed under prefers-reduced-motion at the component level.
 */
export const LazyShimmerButton = dynamic(
    () => import("@/components/ui/shimmer-button").then((m) => m.ShimmerButton)
)
