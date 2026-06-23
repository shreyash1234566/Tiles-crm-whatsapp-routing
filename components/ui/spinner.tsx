import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Vendored modern Spinner.
 * Uses Tailwind's built-in `animate-spin` CSS animation (no JS animation
 * runtime). Color comes from `currentColor` via the inherited text token, so
 * it adopts the Active_Vertical palette anywhere it is placed. No hardcoded
 * colors. Respects prefers-reduced-motion by stopping the spin.
 */
const spinnerVariants = cva("animate-spin motion-reduce:animate-none", {
    variants: {
        size: {
            xs: "size-3",
            sm: "size-4",
            default: "size-5",
            lg: "size-6",
            xl: "size-8",
        },
        tone: {
            current: "text-current",
            accent: "text-accent",
            muted: "text-muted",
        },
    },
    defaultVariants: {
        size: "default",
        tone: "current",
    },
})

function Spinner({
    className,
    size = "default",
    tone = "current",
    label = "Loading",
    ...props
}: React.ComponentProps<"svg"> &
    VariantProps<typeof spinnerVariants> & { label?: string }) {
    return (
        <Loader2Icon
            data-slot="spinner"
            role="status"
            aria-label={label}
            className={cn(spinnerVariants({ size, tone }), className)}
            {...props}
        />
    )
}

export { Spinner, spinnerVariants }
