"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Vendored modern SpotlightCard.
 * A premium card with a cursor-following radial highlight. The spotlight
 * position is tracked via CSS custom properties updated on pointer move —
 * this needs the DOM, so the component is a Client Component, but it requires
 * NO JS animation runtime (the highlight is a plain CSS radial-gradient).
 *
 * The highlight color is derived from the --color-accent token (exposed as an
 * rgb triple so it can be used with an alpha in the gradient), so the effect
 * adopts the Active_Vertical palette. Surface/border/text use --color-* tokens
 * too. No hardcoded color values. The pointer highlight is purely decorative,
 * so it is hidden under prefers-reduced-motion.
 */
function SpotlightCard({
    className,
    children,
    style,
    ...props
}: React.ComponentProps<"div">) {
    const ref = React.useRef<HTMLDivElement>(null)

    const handlePointerMove = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const el = ref.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            el.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`)
            el.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`)
            el.style.setProperty("--spotlight-opacity", "1")
        },
        []
    )

    const handlePointerLeave = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.currentTarget.style.setProperty("--spotlight-opacity", "0")
        },
        []
    )

    return (
        <div
            ref={ref}
            data-slot="spotlight-card"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={cn(
                "group/spotlight relative overflow-hidden rounded-xl bg-surface p-4 text-sm text-foreground ring-1 ring-border transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]",
                className
            )}
            style={
                {
                    "--spotlight-opacity": "0",
                    ...style,
                } as React.CSSProperties
            }
            {...props}
        >
            {/* Token-driven spotlight overlay — uses the accent token with alpha */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[var(--spotlight-opacity)] transition-opacity duration-300 motion-reduce:hidden"
                style={{
                    background:
                        "radial-gradient(220px circle at var(--spotlight-x) var(--spotlight-y), color-mix(in oklch, var(--color-accent) 18%, transparent), transparent 60%)",
                }}
            />
            <div className="relative z-10">{children}</div>
        </div>
    )
}

export { SpotlightCard }
