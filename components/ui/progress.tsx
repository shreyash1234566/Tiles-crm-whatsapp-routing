"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

/**
 * Vendored modern Progress component.
 * Built on @base-ui/react primitives + Tailwind v4 + cn().
 * Styled exclusively via --color-* design tokens (bg-surface-light, bg-accent),
 * so it inherits the Active_Vertical palette (Furzentic / Homzentic) automatically.
 * No hardcoded color values.
 */
function Progress({ className, ...props }: ProgressPrimitive.Root.Props) {
    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            className={cn("flex w-full flex-col gap-1.5", className)}
            {...props}
        />
    )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
    return (
        <ProgressPrimitive.Track
            data-slot="progress-track"
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-surface-light ring-1 ring-border",
                className
            )}
            {...props}
        />
    )
}

function ProgressIndicator({
    className,
    ...props
}: ProgressPrimitive.Indicator.Props) {
    return (
        <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className={cn(
                "h-full rounded-full bg-accent transition-all duration-300 ease-out",
                className
            )}
            {...props}
        />
    )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
    return (
        <ProgressPrimitive.Label
            data-slot="progress-label"
            className={cn("text-sm font-medium text-foreground", className)}
            {...props}
        />
    )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
    return (
        <ProgressPrimitive.Value
            data-slot="progress-value"
            className={cn("text-sm text-muted tabular-nums", className)}
            {...props}
        />
    )
}

export {
    Progress,
    ProgressTrack,
    ProgressIndicator,
    ProgressLabel,
    ProgressValue,
}
