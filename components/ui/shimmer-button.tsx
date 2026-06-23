import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "@/lib/utils"

/**
 * Vendored modern ShimmerButton.
 * Built on @base-ui/react Button primitive + Tailwind v4 + cn().
 * The animated shine is achieved with a pure-CSS keyframe
 * (`.animate-shimmer-slide` in globals.css) — no JS animation runtime.
 * All colors come from --color-* design tokens (bg-accent, text-surface,
 * accent-light, accent-hover), so the button renders Furzentic or Homzentic
 * automatically from the active palette. No hardcoded color values.
 * The shimmer overlay uses currentColor-derived token tints only and is
 * suppressed under prefers-reduced-motion.
 */
function ShimmerButton({
    className,
    children,
    ...props
}: ButtonPrimitive.Props) {
    return (
        <ButtonPrimitive
            data-slot="shimmer-button"
            className={cn(
                "group/shimmer relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-transparent bg-accent px-4 text-sm font-medium whitespace-nowrap text-surface transition-all outline-none select-none",
                "hover:bg-accent-hover",
                "focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light",
                "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                className
            )}
            {...props}
        >
            {/* Token-tinted sheen — uses surface-tinted gradient, no literal colors */}
            <span
                aria-hidden="true"
                className="animate-shimmer-slide pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-surface/25 to-transparent"
            />
            <span className="relative z-10 inline-flex items-center gap-1.5">
                {children}
            </span>
        </ButtonPrimitive>
    )
}

export { ShimmerButton }
