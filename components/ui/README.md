# Vendored UI components — performance-budget loading patterns

These components were copied in (shadcn-style) under task 11.1. Task 11.2 documents
the loading conventions every consumer must follow so the rebrand stays inside the
Performance_Budget (Requirement 16). Treat this file as the contract for *how* to
import and render these components, not just *that* they exist.

## Component classification

| Component        | File                 | Kind                     | Animation         | How to load |
| ---------------- | -------------------- | ------------------------ | ----------------- | ----------- |
| `Skeleton`       | `skeleton.tsx`       | **Server Component**     | CSS `animate-pulse` | Direct import |
| `Spinner`        | `spinner.tsx`        | Server-renderable        | CSS `animate-spin`  | Direct import |
| `Progress`       | `progress.tsx`       | Client (`@base-ui` state) | CSS transition     | Direct import |
| `ShimmerButton`  | `shimmer-button.tsx` | Client (animated)        | CSS keyframe (`animate-shimmer-slide`) | Prefer `LazyShimmerButton` |
| `SpotlightCard`  | `spotlight-card.tsx` | Client (pointer-driven)  | CSS radial-gradient | Prefer `LazySpotlightCard` |

## The rules

### 1. Code-split heavy / animated components (Req 16.3)

Import the heavy, animated client components through the code-split entry points in
[`lazy.tsx`](./lazy.tsx) so their JavaScript stays out of the initial route payload:

```tsx
import { LazySpotlightCard, LazyShimmerButton } from "@/components/ui/lazy"
```

Import a heavy component directly from its own module **only** when it is critical,
above-the-fold content that must appear in the first paint.

### 2. Keep non-interactive components as Server Components (Req 16.4)

`Skeleton` has no `"use client"` directive and renders on the server. Do not add
client-only logic (state, effects, event handlers) to it or to any other
non-interactive presentational component — that would force it into a Client
Component and grow the client bundle. Loading/empty states should stay server-rendered.

### 3. Prefer CSS animation over a JS runtime (Req 16.5)

Every animated component here uses CSS only:

- `Skeleton` → Tailwind `animate-pulse`
- `Spinner` → Tailwind `animate-spin`
- `ShimmerButton` → `@keyframes shimmer-slide` / `.animate-shimmer-slide` in `app/globals.css`
- `SpotlightCard` → a CSS `radial-gradient` positioned by CSS custom properties

No JavaScript animation runtime (`motion`/framer-motion) is installed. Reach for
`tw-animate-css` or a hand-written keyframe before considering a JS runtime. If a
future component genuinely needs JS animation, add a **single shared** `motion`
dependency at one version (Req 15.8) and load it only through a code-split component.

### 4. Load any animation runtime only where used (Req 16.6)

When a component does pull in a JS animation runtime, expose it exclusively through a
`dynamic()` entry in `lazy.tsx`. That keeps the runtime in the component's split chunk
so routes that never render it never download it.

### 5. Honor `prefers-reduced-motion` (Req 16.7)

Decorative motion is suppressed when the user requests reduced motion:

- Tailwind `motion-reduce:animate-none` on `Skeleton` and `Spinner`
- `motion-reduce:hidden` on the `SpotlightCard` highlight overlay
- a `@media (prefers-reduced-motion: reduce)` rule disabling `.animate-shimmer-slide`
  in `app/globals.css`

Any new animated component must add an equivalent `motion-reduce:*` utility or media
query for its non-essential motion.

### 6. No per-row animation on large lists / tables (Req 16.8)

Do not place `ShimmerButton`, `SpotlightCard`, or any continuously-animated component
inside the rows of a large data table or list. Per-row animation multiplies work
across every visible row and degrades scroll and input responsiveness. Instead:

- use the static `Skeleton` for row-level loading placeholders, and
- confine animated surfaces (spotlight cards, shimmer buttons) to headers, summary
  cards, empty states, or single call-to-action controls.

## Theming reminder

All components style exclusively via `--color-*` design tokens, so they adopt the
Active_Vertical palette automatically — Furzentic by default and Homzentic under
`[data-brand="homzentic"]` (Requirement 15.3–15.7). Never introduce hardcoded colors.
