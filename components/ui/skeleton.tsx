import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Vendored modern Skeleton loading placeholder.
 * Non-interactive, so it renders as a Server Component (no "use client").
 * Uses Tailwind's built-in `animate-pulse` CSS animation (no JS animation
 * runtime) and styles exclusively via --color-* tokens, so it themes with
 * the Active_Vertical palette. No hardcoded colors.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="skeleton"
            className={cn(
                "animate-pulse rounded-md bg-surface-light motion-reduce:animate-none",
                className
            )}
            {...props}
        />
    )
}

export { Skeleton }
