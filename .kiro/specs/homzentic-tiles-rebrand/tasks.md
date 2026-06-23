# Implementation Plan: Homzentic Tiles Rebrand

## Overview

This plan implements the Homzentic rebrand of the `tiles` vertical as an additive, isolation-first change to the shared Next.js 16 + Prisma + PostgreSQL CRM. Work proceeds from the brand/identity foundation (`lib/brand.ts`, terminology), through the theme layer (`data-brand` attribute + scoped `globals.css` token overrides and vendored components), into the domain layer (tiles product attributes, category seed, area-based quotation math), and finally settings, WhatsApp templates, upload paths, and a documented verification checklist.

Every task is gated on the resolved `Active_Vertical` so the `furniture` ("Furzentic") experience stays byte-for-byte unchanged. Property tests use **fast-check** (TypeScript) at a minimum of 100 iterations each, tagged `// Feature: homzentic-tiles-rebrand, Property {number}: {property_text}`. Test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Establish the vertical-aware brand foundation
  - [x] 1.1 Implement `lib/brand.ts` Brand_Config module
    - Define `Vertical`, `ThemeKey`, and `BrandIdentity` types
    - Implement `resolveVertical(raw)` (trim + lowercase; `tiles` only on exact match, else `furniture`)
    - Implement `getActiveVertical()` reading `BUSINESS_TYPE ?? NEXT_PUBLIC_BUSINESS_TYPE`
    - Implement `getBrand(vertical?)` returning complete Furzentic and Homzentic identities (name, shortName, title, description, tagline, logo, favicon, themeKey, brandAttribute, full support block)
    - Use the exact current furniture strings (title `"Furzentic — Smart Store Manager"`, etc.) and `brandAttribute: null` for furniture
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 13.2_

  - [ ]* 1.2 Write property test for vertical resolution
    - **Property 1: Vertical resolution defaults to furniture**
    - **Validates: Requirements 1.4, 13.2**

  - [ ]* 1.3 Write property test for brand identity by vertical
    - **Property 2: Brand identity matches the resolved vertical**
    - **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 4.1, 4.2, 13.4**

  - [ ]* 1.4 Write property test for brand identity completeness
    - **Property 3: Brand identity is complete**
    - **Validates: Requirements 1.1**

  - [x] 1.5 Implement `lib/terminology.ts` Terminology_Set
    - Define `TermKey` union, `SHARED` defaults, and per-vertical `OVERRIDES` (tiles labels for showroom, design consultation, catalog; furniture overrides empty/identical)
    - Implement `getTerm(key, vertical?)` resolving override → shared default, never undefined for a known key
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 1.6 Write property test for terminology resolution
    - **Property 4: Terminology resolves override-then-default**
    - **Validates: Requirements 9.1, 9.4**

- [x] 2. Wire brand identity into app metadata and theme attribute
  - [x] 2.1 Convert `app/layout.js` metadata to vertical-aware `generateMetadata()`
    - Replace the static `metadata` export with `generateMetadata()` returning title, description, and icons from `getBrand()`
    - Set `<html lang="en" data-brand={brand.brandAttribute ?? undefined}>` so the attribute is omitted under furniture and `homzentic` under tiles
    - Leave provider tree and font wiring unchanged
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 13.4_

  - [ ]* 2.2 Write unit tests for furniture metadata and brand attribute
    - Assert furniture title/description/favicon equal the exact pre-rebrand strings and `data-brand` is absent
    - Assert tiles sets the Homzentic title/description/favicon and `data-brand="homzentic"`
    - _Requirements: 2.2, 2.5, 4.2, 13.1, 13.4_

- [x] 3. Apply the Homzentic palette as scoped token overrides
  - [x] 3.1 Append `[data-brand="homzentic"]` override block in `app/globals.css`
    - Leave the entire furniture `@theme inline` block untouched
    - Define a light-only value for every `--color-*` token the furniture palette defines, chosen to meet WCAG AA contrast
    - Do not introduce any dark-mode color scheme
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 13.5_

  - [ ]* 3.2 Write CSS audit test for palette token completeness
    - **Property 5: Homzentic palette defines every furniture token**
    - **Validates: Requirements 4.6**

  - [ ]* 3.3 Write contrast check test for Homzentic palette
    - **Property 6: Homzentic palette meets contrast minimums**
    - **Validates: Requirements 5.1, 5.2**

- [ ] 4. Render brand identity across the in-app chrome
  - [x] 4.1 Replace hardcoded brand literals in `components/Sidebar.js` and `components/TopBar.js`
    - Render logo, brand name, and support contacts from `getBrand()` (supply brand to client components via `NEXT_PUBLIC_BUSINESS_TYPE`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Replace hardcoded brand literals in the login/authentication screen
    - Render logo and brand name from `getBrand()`
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 5. Checkpoint - brand foundation and theme
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Make supporting integrations vertical-aware
  - [x] 6.1 Make `getUploadsRoot()` in `lib/r2.ts` vertical-aware
    - Return `UPLOAD_DIR` (trailing separators stripped) when set; otherwise tiles-named default for tiles, existing furniture-named default for furniture
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 6.2 Write property test for upload root resolution
    - **Property 12: Upload root resolution**
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [x] 6.3 Source WhatsApp templates from Brand_Config
    - In `lib/whatsapp/inquiry-message.ts` and `lib/whatsapp/appointment-bot.ts`, replace hardcoded brand name, phone, address, and website with `getBrand()` values
    - Use tiles terminology/category descriptions when the vertical is tiles; preserve existing furniture output via furniture Brand_Config values
    - Keep existing try/catch "never break main flow" behavior
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 6.4 Write unit tests for WhatsApp brand substitution
    - Assert tiles messages use Homzentic name/contacts/address and tiles categories; furniture messages match existing content
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 7. Add tiles & sanitary product attributes
  - [x] 7.1 Add nullable tiles attribute fields to the Prisma `Product` model
    - Add `tileSize`, `finish`, `coveragePerBox`, `tilesPerBox`, `surfaceType`, `applicationArea` as nullable/optional fields; keep `unitOfMeasure String @default("PCS")`
    - Generate an additive migration with no backfill so furniture rows stay valid
    - _Requirements: 6.2, 6.4, 13.3_

  - [x] 7.2 Extend product validation and the product form for tiles
    - Update the `zod` schema in `lib/validations` to accept the tiles attributes and `SQFT`/`BOX` units (defaulting `PCS`); enforce finish set (glossy/matte/rustic) and application area set (floor/wall/bathroom)
    - Show the Tiles_Attribute_Set inputs and SQFT/BOX options only when `Active_Vertical === 'tiles'`; furniture shows existing fields with no tiles inputs
    - _Requirements: 6.1, 6.3, 6.5, 6.6, 6.7_

  - [ ]* 7.3 Write property test for optional tiles attributes
    - **Property 13: Tiles attributes are optional in the data model**
    - **Validates: Requirements 6.2, 6.4, 13.3**

  - [x] 7.4 Add the tiles & sanitary category set to `prisma/seed.ts`
    - When `BUSINESS_TYPE=tiles`, seed Floor Tiles, Wall Tiles, Vitrified Tiles, Bathroom Fittings, Sanitaryware, Faucets, Adhesives & Grouts, Kitchen Sinks; otherwise seed the existing furniture categories unchanged
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Implement area-based quotation and invoice calculation
  - [x] 8.1 Add `computeLineAmount(item, product)` helper for line-level math
    - SQFT: `amount = area * perSqftPrice`; with positive `coveragePerBox` → `boxes = ceil(area / coveragePerBox)`
    - BOX with coverage: derive boxes from area
    - SQFT/BOX without coverage: use entered quantity directly, no box conversion
    - Furniture/PCS: `quantity * rate` unchanged; return `{ amount, boxes?, area? }`
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 8.2 Integrate `computeLineAmount` into `computeTotals()` and render area + box count
    - Slot area logic at the per-line stage in `app/(dashboard)/quotations/page.js` and the matching invoice path; leave the downstream discount/installation/freight/loading/GST pipeline untouched
    - Display both entered area and resulting box count on lines where a conversion occurred
    - _Requirements: 8.3, 8.6_

  - [ ]* 8.3 Write property test for SQFT line amount
    - **Property 7: SQFT line amount is area times unit price**
    - **Validates: Requirements 8.1**

  - [ ]* 8.4 Write property test for area-to-box rounding
    - **Property 8: Area-to-box conversion rounds up**
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 8.5 Write property test for missing-coverage fallback
    - **Property 9: Missing coverage skips box conversion**
    - **Validates: Requirements 8.4**

  - [ ]* 8.6 Write property test for unchanged furniture line math
    - **Property 10: Furniture line math is unchanged**
    - **Validates: Requirements 8.5, 13.1**

  - [ ]* 8.7 Write property test for unit-agnostic totals pipeline
    - **Property 11: Tax/discount pipeline is unit-agnostic**
    - **Validates: Requirements 8.6**

- [x] 9. Checkpoint - domain logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement brand and appearance settings
  - [x] 10.1 Build the Settings_Module display and persistence
    - In `app/(dashboard)/settings/page.js` + `app/actions/settings`, display and edit `StoreSettings` (name, phone, email, address) and support logo upload for the active vertical, writing through the active vertical's Prisma client
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_

  - [x] 10.2 Add server-side settings validation
    - `zod` schema rejecting malformed email and empty store name with a field-identifying message; leave prior logo intact on upload error
    - _Requirements: 12.4_

  - [ ]* 10.3 Write property test for settings validation
    - **Property 14: Store settings validation rejects invalid contacts**
    - **Validates: Requirements 12.2, 12.4**

- [x] 11. Adopt modern components within the styling and performance budget
  - [x] 11.1 Vendor modern components into `components/ui/*`
    - Copy each Modern_Component in as a Vendored_Component built on `@base-ui/react` + Tailwind v4 + `cn()`; style exclusively via `--color-*` tokens with no hardcoded colors; reject components that cannot consume tokens
    - Add a single shared `motion` runtime at one version only if JS animation is required
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [x] 11.2 Apply performance-budget loading patterns to adopted components
    - Code-split heavy/animated components via dynamic `import()`; render non-interactive components as Server Components; prefer `tw-animate-css` over JS; load `motion` only where used; honor `prefers-reduced-motion`; avoid per-row animation on large tables/lists
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

- [x] 12. Produce rollout verification artifacts
  - [x] 12.1 Author the documented verification checklist and performance budget
    - Create a checklist comparing sidebar, top bar, auth, product form, quotation/invoice, and settings before/after for furniture; confirm tiles shows Homzentic name, palette, terminology, attributes/units, and area calculation; confirm switching `BUSINESS_TYPE` changes only the intended vertical
    - Define the Performance_Budget (initial-route JS payload limit, LCP target, INP target on a mid-range device, max added animation/component bundle) and a Bundle_Analysis check step
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 16.1, 16.2, 16.9_

- [x] 13. Final checkpoint - full rebrand verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirement sub-clauses for traceability.
- Property tests use fast-check (TypeScript), minimum 100 iterations, tagged `// Feature: homzentic-tiles-rebrand, Property {n}: {text}`.
- Checkpoints ensure incremental validation; isolation of the furniture vertical is verified at each stage.
- All Prisma changes are additive/nullable so existing furniture records remain valid.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "6.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "3.2", "3.3", "6.2", "7.4", "8.1"] },
    { "id": 2, "tasks": ["1.6", "2.1", "4.1", "4.2", "6.3", "7.2", "8.2", "10.1", "11.1"] },
    { "id": 3, "tasks": ["2.2", "6.4", "7.3", "8.3", "8.4", "8.5", "8.6", "8.7", "10.2", "11.2", "12.1"] },
    { "id": 4, "tasks": ["10.3"] }
  ]
}
```
