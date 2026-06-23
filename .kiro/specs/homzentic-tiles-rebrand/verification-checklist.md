# Homzentic Tiles Rebrand — Verification Checklist & Performance Budget

> Rollout verification artifact for the `homzentic-tiles-rebrand` spec.
> Satisfies **Requirements 14.1, 14.2, 14.3, 14.4, 16.1, 16.2, 16.9**.

This document is the gate that must be exercised before releasing the rebrand. It proves two
things at once:

1. **Furniture is unchanged** — the `furniture` ("Furzentic") vertical renders and behaves
   identically before and after the change (the isolation guarantee, Req 13).
2. **Tiles is Homzentic** — the `tiles` vertical presents the Homzentic name, palette,
   terminology, attributes/units, and area-based calculation (Req 14.1).

Switching is driven **solely** by `BUSINESS_TYPE`; no other config change is required (Req 13.2, 14.4).

---

## How to run the verification

The app selects its vertical from the `BUSINESS_TYPE` server env var (mirrored to the client via
`NEXT_PUBLIC_BUSINESS_TYPE`). The two verticals run against separate databases.

| Vertical | Brand | Boot command | Port |
| --- | --- | --- | --- |
| furniture (default) | Furzentic | `npm run dev` | 3000 |
| furniture (unset env) | Furzentic | unset `BUSINESS_TYPE` then `npm run dev` | 3000 |
| tiles | Homzentic | `npm run dev:tiles` (loads `.env.tiles`) | 3001 |

For a production-equivalent check, use `npm run build` followed by `npm run start` with the matching
env. Run furniture and tiles side by side (different ports) to compare screens directly.

Mark each row **PASS / FAIL / N/A** and capture a screenshot where a visual comparison is called for.

---

## Part A — Furniture before/after comparison (Req 14.2, 14.3)

Goal: every furniture screen is byte-for-byte (or pixel-for-pixel) identical to the pre-rebrand
build. Compare the current `BUSINESS_TYPE=furniture` build against the last pre-rebrand
release (tag/commit) of the same screen.

### A1. Sidebar (`components/Sidebar.js`)
- [ ] Brand name reads exactly **"Furzentic"** (no Homzentic string anywhere).
- [ ] Logo asset is the existing Furzentic logo, same path and dimensions.
- [ ] Navigation items, ordering, icons, and grouping are unchanged.
- [ ] Support contact block (if shown) matches pre-rebrand phone/email/website values.
- [ ] Colors/spacing match the Furniture_Palette (no `data-brand="homzentic"` styling applied).

### A2. Top bar (`components/TopBar.js`)
- [ ] Brand name / title text is the existing Furzentic value.
- [ ] Logo, search, profile menu, and notification affordances are unchanged.
- [ ] No Homzentic palette tokens applied; background/foreground colors match baseline.

### A3. Authentication / login screen
- [ ] Logo and brand name render the existing Furzentic identity.
- [ ] Heading, tagline, and supporting copy match pre-rebrand text.
- [ ] Form fields, validation messages, and button styling are unchanged.

### A4. Product form (`app/(dashboard)/products` form)
- [ ] Existing furniture fields appear exactly as before.
- [ ] **No** Tiles_Attribute_Set inputs are visible (tile size, finish, coverage/box,
      tiles-per-box, surface type, application area). (Req 6.7)
- [ ] Unit-of-measure control does **not** offer `SQFT` / `BOX`; default remains `PCS`. (Req 6.7)
- [ ] Submitting a furniture product saves with the same payload shape as before
      (new tiles columns remain null). (Req 13.3)

### A5. Quotation / Invoice (`app/(dashboard)/quotations/page.js` + invoice path)
- [ ] Line amount equals `quantity * rate` for every line (no area/box conversion). (Req 8.5)
- [ ] Subtotal → discount → installation → freight → loading → GST → grand total pipeline
      produces identical numbers to the pre-rebrand build for the same inputs. (Req 8.6)
- [ ] No "area" or "boxes" columns/labels appear on furniture lines.
- [ ] PDF / print output is unchanged.

### A6. Settings (`app/(dashboard)/settings/page.js`)
- [ ] Store name, phone, email, address display the furniture `StoreSettings` values.
- [ ] Logo upload/replace works against the furniture database only. (Req 12.6)
- [ ] Validation behaves as before (malformed email / empty name rejected with field message). (Req 12.4)
- [ ] No Homzentic-specific appearance options leak into the furniture vertical.

### A7. Global furniture isolation checks (Req 13.1, 13.4, 13.5)
- [ ] Root `<html>` element has **no** `data-brand` attribute (or `data-brand="furniture"`). (Req 13.4)
- [ ] Document `<title>` is exactly **"Furzentic — Smart Store Manager"**. (Req 2.2)
- [ ] Meta description and favicon are the existing Furzentic assets. (Req 2.5)
- [ ] `app/globals.css` `@theme inline` furniture token values are unmodified vs. baseline (diff check). (Req 13.5)
- [ ] WhatsApp inquiry + appointment messages contain the existing furniture brand/contact copy. (Req 10.3)

---

## Part B — Tiles (Homzentic) confirmation (Req 14.1)

Boot with `BUSINESS_TYPE=tiles` (`npm run dev:tiles`). Confirm the Homzentic experience on the
same set of screens.

### B1. Homzentic brand name & identity (Req 1.2, 2.1, 3.1)
- [ ] Sidebar, top bar, and auth screen render the brand name **"Homzentic"**.
- [ ] Homzentic logo and favicon are served.
- [ ] Document `<title>` and meta description are the Homzentic tiles & sanitary values. (Req 2.1, 2.3)
- [ ] Support phone, email, website, and address shown are the Homzentic contacts from Brand_Config. (Req 3.3)

### B2. Homzentic palette (Req 4.1, 4.3, 5.1, 5.2)
- [ ] Root `<html>` element has `data-brand="homzentic"`. (Req 4.1)
- [ ] Every screen applies the Homzentic_Palette (`--color-*` overrides), visibly distinct from furniture.
- [ ] No undefined/transparent tokens: no element renders with a missing color. (Req 4.6)
- [ ] Palette is light-only; no dark-mode scheme appears. (Req 4.7)
- [ ] Spot-check contrast: body text ≥ 4.5:1, large text / control borders / focus rings ≥ 3:1
      against their backgrounds. (Req 5.1, 5.2)
- [ ] Responsive layout and touch-target sizes are preserved on mobile and desktop breakpoints. (Req 5.3, 5.4)

### B3. Tiles terminology (Req 9.1, 9.2)
- [ ] Showroom, design consultation, and catalog concepts display the Homzentic tiles labels.
- [ ] Labels with no vertical override fall back to the shared default (no blank/undefined labels). (Req 9.4)

### B4. Tiles product attributes & units (Req 6.1, 6.3, 6.5, 6.6)
- [ ] Product form shows the Tiles_Attribute_Set: tile size, finish, per-box coverage,
      tiles-per-box, surface type, application area.
- [ ] Finish is a selectable set including **glossy / matte / rustic**. (Req 6.5)
- [ ] Application area is a selectable set including **floor / wall / bathroom**. (Req 6.6)
- [ ] Unit-of-measure offers `SQFT` and `BOX` in addition to `PCS`; default is `PCS`. (Req 6.3, 6.4)
- [ ] Saving a tiles product with attributes left blank still succeeds (fields nullable). (Req 6.2)
- [ ] Categories available match the tiles & sanitary set (Floor Tiles, Wall Tiles, Vitrified
      Tiles, Bathroom Fittings, Sanitaryware, Faucets, Adhesives & Grouts, Kitchen Sinks). (Req 7.1)

### B5. Area-based quotation / invoice calculation (Req 8.1–8.4)
- [ ] `SQFT` line: amount = entered area × per-SQFT price. (Req 8.1)
- [ ] Area line with positive `coveragePerBox`: box count = `ceil(area / coveragePerBox)`, and
      both the entered area **and** the resulting box count are displayed on the line. (Req 8.2, 8.3)
- [ ] `SQFT` / `BOX` product with no coverage: uses entered quantity directly, no box conversion. (Req 8.4)
- [ ] Discount / installation / freight / loading / GST pipeline applies to area lines the same
      way it applies to per-unit lines. (Req 8.6)

### B6. Homzentic settings & WhatsApp (Req 12.1, 10.1, 10.2)
- [ ] Settings displays/edits the tiles `StoreSettings`; writes hit the tiles DB only. (Req 12.6)
- [ ] WhatsApp inquiry + appointment messages use the Homzentic name, contacts, address, website. (Req 10.1)
- [ ] WhatsApp copy describes tiles & sanitary categories, not furniture. (Req 10.2)

---

## Part C — `BUSINESS_TYPE` switch isolation (Req 14.4, 13.2)

Goal: prove that flipping `BUSINESS_TYPE` is the **only** change needed and that it changes
**only the intended vertical's** presentation — nothing bleeds across.

- [ ] Starting from furniture, set `BUSINESS_TYPE=tiles` (no other config edits) and reboot:
      the app fully becomes Homzentic (name, palette, terminology, attributes, area math). (Req 13.2)
- [ ] Starting from tiles, set `BUSINESS_TYPE=furniture` (or unset) and reboot: the app fully
      returns to Furzentic with the baseline behavior. (Req 14.2)
- [ ] With `BUSINESS_TYPE` unset/empty/unrecognized, the app resolves to **furniture**. (Req 1.4)
- [ ] Tiles edits (settings, products) do **not** appear in the furniture database, and vice
      versa (separate-database isolation). (Req 12.6)
- [ ] No screen shows a mix of brands (e.g. Homzentic palette with Furzentic name, or tiles
      inputs in the furniture form). The verticals are mutually exclusive.
- [ ] `data-brand` is present (`homzentic`) only under tiles and absent under furniture — confirm
      via DOM inspection in both modes. (Req 4.1, 4.2, 13.4)

---

## Part D — Performance Budget (Req 16.1)

The rebrand commits to the following measurable limits. They are evaluated on a **Mid_Range_Device**
profile and must hold for every verified route. No verified route may exceed these limits (Req 16.2).

### Mid_Range_Device reference profile
- **CPU**: 4× CPU slowdown applied in Chrome DevTools (approximates a mid-tier Android / older laptop).
- **Network**: "Fast 3G" / ~1.6 Mbps down, ~150 ms RTT throttling for field-equivalent loads.
- **Viewport**: 1366×768 desktop and 390×844 mobile, both checked.

### Budget limits

| Metric | Budget | Notes |
| --- | --- | --- |
| **Initial-route JS payload** (first-load JS, gzipped, per verified route) | **≤ 300 KB**, and **≤ baseline + 30 KB** | "Baseline" = the pre-rebrand first-load JS for the same route from `next build` output. The +30 KB allowance covers vendored components/theme. |
| **Max added animation + component bundle** (client JS added by the rebrand, gzipped) | **≤ 30 KB total** | Single shared `motion` runtime counts against this and is loaded only on routes that use it (Req 16.6). Vendored `components/ui/*` count here. |
| **LCP** (Largest Contentful Paint, Mid_Range_Device) | **≤ 2.5 s** | "Good" Core Web Vitals threshold; must not regress vs. baseline. |
| **INP** (Interaction to Next Paint, Mid_Range_Device) | **≤ 200 ms** | "Good" Core Web Vitals threshold; measured on primary interactions (nav, form open, quotation line entry). |
| **No verified route regression** | LCP/INP must not increase by **> 10%** vs. the pre-rebrand baseline | Applies even when absolute numbers stay within the "Good" bands. |

### Performance handling commitments (Req 16.3–16.8)
These are the implementation rules the budget assumes; verify they hold:
- [ ] Heavy/animated vendored components are loaded via code-split `dynamic import()` and are **not**
      in the initial-route JS payload. (Req 16.3)
- [ ] Non-interactive vendored components are rendered as Server Components. (Req 16.4)
- [ ] CSS animation (`tw-animate-css`) is used in preference to the JS runtime wherever it suffices. (Req 16.5)
- [ ] The `motion` runtime is loaded only on routes/components that use it. (Req 16.6)
- [ ] `prefers-reduced-motion: reduce` suppresses/reduces non-essential animation. (Req 16.7)
- [ ] Large data lists/tables have no continuous or per-row animation that harms scroll/input. (Req 16.8)

---

## Part E — Bundle_Analysis check step (Req 16.9)

Run this measurement step for both verticals and compare against the pre-rebrand baseline. The
verification checklist passes only when every route stays within the Part D budget.

### E1. Capture the build output (first-load JS per route)
Run a production build and read the per-route **First Load JS** table that Next.js prints:

```bash
# furniture baseline / after
npm run build
# tiles
npm run build   # then boot with BUSINESS_TYPE=tiles for runtime metrics
```

Record, for each verified route (sidebar/dashboard shell, auth, products form, quotations,
invoices, settings):
- [ ] Route path
- [ ] First Load JS (KB) — pre-rebrand baseline
- [ ] First Load JS (KB) — after rebrand
- [ ] Delta (must be ≤ +30 KB and route must stay ≤ 300 KB)

### E2. Inspect bundle composition (what was added)
Use a bundle analyzer to confirm the added weight is only the vendored components and the single
`motion` runtime, and that `motion` does **not** appear in routes that don't use it:

```bash
# Option A: Next.js built-in analyzer
ANALYZE=true npm run build        # requires @next/bundle-analyzer wired in next.config

# Option B: inspect the build manifest / .next/analyze output
```

- [ ] No duplicate/competing animation libraries are bundled (single `motion` version). (Req 15.8)
- [ ] `motion` is absent from routes that don't animate. (Req 16.6)
- [ ] Total added client bundle (animation + components) ≤ 30 KB gzipped. (Req 16.1)

### E3. Field/lab metrics on the Mid_Range_Device profile
Run Lighthouse (or equivalent) with the Mid_Range_Device throttling described in Part D, for each
verified route, in both verticals:

- [ ] LCP recorded — baseline vs. after, both ≤ 2.5 s and no > 10% regression.
- [ ] INP recorded (interact with nav, open product form, add a quotation line) — ≤ 200 ms and no > 10% regression.
- [ ] Results attached/linked to this checklist before sign-off.

---

## Sign-off

| Check group | Result | Verified by | Date |
| --- | --- | --- | --- |
| Part A — Furniture unchanged | | | |
| Part B — Tiles is Homzentic | | | |
| Part C — `BUSINESS_TYPE` isolation | | | |
| Part D/E — Performance budget + bundle analysis | | | |

Release is approved only when all four groups are **PASS**.
