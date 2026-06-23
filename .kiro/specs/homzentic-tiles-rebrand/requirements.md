# Requirements Document

## Introduction

This feature rebrands the Tiles & Sanitary vertical of the shared CRM into a brand called **Homzentic**, overhauls its UI and color palette, and tailors its sections and functionality for a tiles & sanitary showroom. The single codebase serves two verticals selected by the `BUSINESS_TYPE` environment variable: `furniture` (the existing "Furzentic" brand, the default) and `tiles` (the new "Homzentic" brand). Each vertical runs against a separate database (already implemented in the `separate-database-migration` spec).

The single most important constraint is **isolation**: the furniture vertical must render and behave identically before and after this change. All Homzentic branding, theming, terminology, and tiles-specific functionality must activate only when `BUSINESS_TYPE=tiles`, leaving the furniture experience byte-for-byte unchanged where it is not driven by data.

The rebrand introduces a central, vertical-aware brand configuration so that name, logo, tagline, contact details, app metadata, favicon, upload directory naming, and WhatsApp message templates are all derived from the active vertical rather than hardcoded. It scopes a modern, premium Homzentic color palette to the tiles vertical only, enhances the product/quotation domain for tiles & sanitary attributes (size, finish, coverage, application area, SQFT/BOX units, area-based calculations) in a backward-compatible way, applies tiles-relevant terminology, and adds a brand/appearance settings area for per-vertical store identity.

## Glossary

- **CRM**: The shared Next.js (App Router) + Prisma + PostgreSQL application that serves both verticals.
- **Vertical**: A business configuration of the CRM, either `furniture` or `tiles`, selected by `BUSINESS_TYPE`.
- **BUSINESS_TYPE**: The server-side environment variable whose value is `furniture` (default) or `tiles`. Determines the active Vertical.
- **NEXT_PUBLIC_BUSINESS_TYPE**: A public (client-exposed) environment variable mirroring the active Vertical so the browser can apply vertical-aware presentation.
- **Active_Vertical**: The Vertical resolved at runtime from `BUSINESS_TYPE`; `furniture` when the value is unset, empty, or unrecognized.
- **Furniture_Brand**: The existing brand identity ("Furzentic") used when Active_Vertical is `furniture`.
- **Homzentic_Brand**: The new brand identity ("Homzentic") used when Active_Vertical is `tiles`.
- **Brand_Config**: A central module (e.g. `lib/brand.ts`) that returns brand identity values (name, logo, tagline, support contacts, theme key, terminology set) for the Active_Vertical.
- **Brand_Identity**: The set of values exposed by Brand_Config: brand name, logo asset reference, favicon reference, tagline, support phone, support email, website, address, and theme key.
- **Theme_System**: The mechanism that applies a vertical-specific color palette via design tokens defined in `app/globals.css`.
- **Design_Token**: A CSS custom property of the form `--color-*` (and related tokens) consumed by Tailwind v4 and component styles.
- **Brand_Attribute**: A `data-brand` attribute set on the root `<html>`/`<body>` element whose value is `furniture` or `homzentic`.
- **Homzentic_Palette**: The set of Design_Token values applied when the Brand_Attribute is `homzentic`.
- **Furniture_Palette**: The existing set of Design_Token values applied when the Brand_Attribute is absent or `furniture`.
- **Product_Catalog**: The product domain (Prisma `Product` model and its UI) including attributes, categories, and units.
- **Tiles_Attribute_Set**: Tiles & sanitary product attributes: tile size, finish, per-box coverage, tiles-per-box, surface type, and application area.
- **Unit_Of_Measure**: The unit assigned to a product or line item (e.g. `PCS`, `SQFT`, `BOX`).
- **Quotation_Engine**: The logic and UI that compute quotation and invoice line items, including area-based calculations.
- **Settings_Module**: The settings area where store identity (name, logo, colors, contacts) is viewed and edited.
- **Store_Settings**: The persisted `StoreSettings` record (store name, phone, email, address, GST, currency).
- **Seed_System**: The vertical-aware `prisma/seed.ts` entry point that branches on `BUSINESS_TYPE`.
- **WhatsApp_Templates**: The automated WhatsApp messages in `lib/whatsapp/inquiry-message.ts` and `lib/whatsapp/appointment-bot.ts`.
- **WCAG_AA**: WCAG 2.1 Level AA contrast minimums: 4.5:1 for normal text and 3:1 for large text and UI component boundaries.
- **Terminology_Set**: The vertical-specific labels for shared UI concepts (e.g. "showroom", "design consultation", "catalog").
- **Component_Library**: An external source of modern UI components (e.g. 21st.dev, Magic UI, Cult UI, Skiper UI, UIverse, and similar) from which individual components may be adopted into the CRM.
- **Modern_Component**: A UI component adopted from a Component_Library into the CRM's component directory.
- **Component_Directory**: The project's existing component location (`components/ui/*` and related component folders) where shadcn-style components built on `@base-ui/react` primitives reside.
- **Vendored_Component**: A Modern_Component added via a copy-in approach (its source is placed directly into the Component_Directory) rather than consumed as an opaque runtime package, so it is tree-shakeable and auditable.
- **Styling_System**: The CRM's existing styling stack: `@base-ui/react` primitives, Tailwind CSS v4, and the `cn()` helper backed by `clsx` and `tailwind-merge`.
- **Design_Tokens**: The set of CSS custom properties (`--color-*` and related) defined in `app/globals.css` that encode the Active_Vertical's palette; equivalent to the collection of Design_Token values.
- **Animation_Runtime**: A JavaScript animation library (e.g. framer-motion / `motion`) required by some Modern_Components to animate.
- **CSS_Animation**: Animation achieved through CSS (e.g. `tw-animate-css`, UIverse-style CSS) without a JavaScript Animation_Runtime.
- **Performance_Budget**: The set of measurable performance limits the rebrand must satisfy, including initial route JavaScript payload size, Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and the maximum added client bundle size from animation and component libraries.
- **LCP**: Largest Contentful Paint, the time at which the largest content element in the viewport becomes visible.
- **INP**: Interaction to Next Paint, a responsiveness metric measuring the latency between a user interaction and the next visual update.
- **Mid_Range_Device**: A reference device profile of moderate CPU and network capability used as the baseline for measuring Performance_Budget metrics.
- **Bundle_Analysis**: A build-time measurement of client JavaScript bundle composition and size (e.g. bundle analyzer output, Lighthouse, or an equivalent tool).

## Requirements

### Requirement 1: Central Vertical-Aware Brand Configuration

**User Story:** As a CRM operator, I want all brand identity values to come from a single vertical-aware configuration, so that the tiles vertical presents as Homzentic without changing the furniture vertical and without scattering hardcoded values.

#### Acceptance Criteria

1. THE Brand_Config SHALL expose, for the Active_Vertical, a Brand_Identity containing brand name, logo asset reference, favicon reference, tagline, support phone, support email, website, address, and theme key.
2. WHEN the Active_Vertical is `tiles`, THE Brand_Config SHALL return a Brand_Identity whose brand name is "Homzentic".
3. WHEN the Active_Vertical is `furniture`, THE Brand_Config SHALL return the existing Furniture_Brand identity values.
4. IF the `BUSINESS_TYPE` value is unset, empty, or unrecognized, THEN THE Brand_Config SHALL resolve the Active_Vertical to `furniture`.
5. THE Brand_Config SHALL be the single source consumed by application metadata, logo rendering, support-contact display, upload directory naming, and WhatsApp_Templates for brand identity values.
6. THE CRM SHALL expose the Active_Vertical to the browser through `NEXT_PUBLIC_BUSINESS_TYPE`.

### Requirement 2: Application Metadata, Title, and Favicon

**User Story:** As a Homzentic showroom user, I want the browser title, description, and favicon to reflect Homzentic, so that the application is recognizably branded.

#### Acceptance Criteria

1. WHEN the Active_Vertical is `tiles`, THE CRM SHALL set the document title to a Homzentic-branded title derived from Brand_Config.
2. WHEN the Active_Vertical is `furniture`, THE CRM SHALL set the document title to the existing Furniture_Brand title ("Furzentic — Smart Store Manager").
3. WHEN the Active_Vertical is `tiles`, THE CRM SHALL set the application description to a tiles & sanitary description derived from Brand_Config.
4. WHEN the Active_Vertical is `tiles`, THE CRM SHALL serve the Homzentic favicon.
5. WHEN the Active_Vertical is `furniture`, THE CRM SHALL serve the existing Furniture_Brand favicon.

### Requirement 3: Logo, Brand Name, and Contact Rendering in the UI

**User Story:** As a Homzentic showroom user, I want the logo, brand name, and contact details shown across the app to be Homzentic's, so that the interface is consistently branded.

#### Acceptance Criteria

1. WHEN the Active_Vertical is `tiles`, THE CRM SHALL render the Homzentic logo and brand name in the sidebar, top bar, and authentication screens using values from Brand_Config.
2. WHEN the Active_Vertical is `furniture`, THE CRM SHALL render the existing Furniture_Brand logo and brand name in the sidebar, top bar, and authentication screens.
3. WHERE the UI displays support contact information, THE CRM SHALL display the support phone, support email, and website for the Active_Vertical from Brand_Config.
4. THE CRM SHALL render the brand name without hardcoded vertical-specific string literals in components.

### Requirement 4: Homzentic Visual Theme Scoped to the Tiles Vertical

**User Story:** As a Homzentic showroom user, I want a modern premium color palette suited to a tiles & sanitary showroom, so that the application feels distinct from the furniture brand, while the furniture palette stays exactly the same.

#### Acceptance Criteria

1. WHEN the Active_Vertical is `tiles`, THE Theme_System SHALL set the Brand_Attribute to `homzentic` on the root element.
2. WHEN the Active_Vertical is `furniture`, THE Theme_System SHALL set the Brand_Attribute to `furniture` or leave it absent.
3. WHILE the Brand_Attribute is `homzentic`, THE Theme_System SHALL apply the Homzentic_Palette Design_Token values.
4. WHILE the Brand_Attribute is absent or `furniture`, THE Theme_System SHALL apply the existing Furniture_Palette Design_Token values.
5. THE Theme_System SHALL define the Homzentic_Palette as overrides scoped to the `homzentic` Brand_Attribute so that the Furniture_Palette token values remain unchanged.
6. THE Homzentic_Palette SHALL define values for every Design_Token that the Furniture_Palette defines, so that no component renders an undefined token under the `homzentic` Brand_Attribute.
7. THE Homzentic_Palette SHALL be a light-only palette and SHALL NOT introduce a dark-mode color scheme.

### Requirement 5: Theme Accessibility and Responsiveness

**User Story:** As a user with visual or device constraints, I want the Homzentic theme to remain readable and usable, so that the rebrand does not reduce accessibility or responsiveness.

#### Acceptance Criteria

1. THE Homzentic_Palette SHALL provide a contrast ratio of at least 4.5:1 between foreground text tokens and their corresponding background tokens for normal-size text.
2. THE Homzentic_Palette SHALL provide a contrast ratio of at least 3:1 for large text, interactive control boundaries, and focus indicators against their adjacent background.
3. WHILE the Brand_Attribute is `homzentic`, THE CRM SHALL preserve the existing responsive layout behavior across mobile and desktop breakpoints.
4. WHILE the Brand_Attribute is `homzentic`, THE CRM SHALL preserve the existing minimum touch-target sizing for interactive controls.

### Requirement 6: Tiles & Sanitary Product Attributes

**User Story:** As a Homzentic showroom manager, I want products to capture tiles & sanitary attributes, so that the catalog reflects how tiles and sanitaryware are actually specified and sold.

#### Acceptance Criteria

1. WHEN the Active_Vertical is `tiles`, THE Product_Catalog SHALL allow recording the Tiles_Attribute_Set: tile size, finish, per-box coverage, tiles-per-box, surface type, and application area.
2. THE Product_Catalog SHALL store the Tiles_Attribute_Set in fields that are nullable and optional, so that existing furniture products remain valid without these values.
3. WHEN the Active_Vertical is `tiles`, THE Product_Catalog SHALL allow a product Unit_Of_Measure of `SQFT` or `BOX` in addition to `PCS`.
4. THE Product_Catalog SHALL default a product Unit_Of_Measure to `PCS` when no Unit_Of_Measure is specified.
5. WHEN the Active_Vertical is `tiles`, THE Product_Catalog SHALL present the finish as a selectable set including glossy, matte, and rustic.
6. WHEN the Active_Vertical is `tiles`, THE Product_Catalog SHALL present the application area as a selectable set including floor, wall, and bathroom.
7. WHEN the Active_Vertical is `furniture`, THE Product_Catalog SHALL display and accept the existing furniture product fields without showing the Tiles_Attribute_Set inputs.

### Requirement 7: Tiles & Sanitary Category Set

**User Story:** As a Homzentic showroom manager, I want the catalog organized into tiles & sanitary categories, so that products are grouped the way customers shop for them.

#### Acceptance Criteria

1. WHEN the Seed_System runs with `BUSINESS_TYPE=tiles`, THE Seed_System SHALL create the tiles & sanitary category set (Floor Tiles, Wall Tiles, Vitrified Tiles, Bathroom Fittings, Sanitaryware, Faucets, Adhesives & Grouts, Kitchen Sinks).
2. WHEN the Seed_System runs with `BUSINESS_TYPE=furniture` or unset, THE Seed_System SHALL create the existing furniture category set unchanged.
3. THE Product_Catalog SHALL allow assigning each product to exactly one category from the category set of the Active_Vertical.

### Requirement 8: Area-Based Quotation and Invoice Calculation

**User Story:** As a Homzentic sales user, I want quotations and invoices to calculate quantities and amounts from area for tiles, so that I can quote in square feet and convert to boxes accurately.

#### Acceptance Criteria

1. WHEN a quotation or invoice line item uses a product whose Unit_Of_Measure is `SQFT`, THE Quotation_Engine SHALL compute the line amount as the entered area multiplied by the per-SQFT price.
2. WHEN a quotation or invoice line item is entered as an area and the product defines a per-box coverage, THE Quotation_Engine SHALL compute the required number of boxes by dividing the area by the per-box coverage and rounding up to the next whole box.
3. WHEN the Quotation_Engine rounds an area up to whole boxes, THE Quotation_Engine SHALL display both the entered area and the resulting box count on the line item.
4. IF a product whose Unit_Of_Measure is `SQFT` or `BOX` has no per-box coverage value, THEN THE Quotation_Engine SHALL calculate using the entered quantity directly and SHALL NOT attempt a box conversion.
5. WHEN the Active_Vertical is `furniture`, THE Quotation_Engine SHALL compute line items using the existing per-unit quantity-times-price behavior unchanged.
6. THE Quotation_Engine SHALL apply existing tax, discount, and currency rules to area-based line items in the same manner as per-unit line items.

### Requirement 9: Vertical-Aware Terminology

**User Story:** As a Homzentic showroom user, I want labels and copy to use tiles & sanitary language, so that the interface matches the showroom's domain.

#### Acceptance Criteria

1. THE CRM SHALL resolve user-facing labels for vertical-specific concepts from a Terminology_Set keyed by the Active_Vertical.
2. WHEN the Active_Vertical is `tiles`, THE CRM SHALL display tiles-relevant terminology for showroom, design consultation, and catalog concepts as defined in the Homzentic Terminology_Set.
3. WHEN the Active_Vertical is `furniture`, THE CRM SHALL display the existing furniture terminology unchanged.
4. WHERE a label has no vertical-specific override in the Terminology_Set, THE CRM SHALL display a shared default label for both verticals.

### Requirement 10: Vertical-Aware WhatsApp Templates

**User Story:** As a Homzentic showroom operator, I want automated WhatsApp messages to reference Homzentic, so that customers receive correct brand, product, and contact information.

#### Acceptance Criteria

1. WHEN the Active_Vertical is `tiles` and an automated WhatsApp message is sent, THE WhatsApp_Templates SHALL use the Homzentic brand name, support contacts, address, and website from Brand_Config.
2. WHEN the Active_Vertical is `tiles`, THE WhatsApp_Templates SHALL describe tiles & sanitary product categories rather than furniture categories.
3. WHEN the Active_Vertical is `furniture`, THE WhatsApp_Templates SHALL send the existing furniture message content unchanged.
4. THE WhatsApp_Templates SHALL source brand name, product descriptions, address, and contact values from Brand_Config rather than hardcoded literals.

### Requirement 11: Upload Directory Naming

**User Story:** As a CRM operator, I want uploaded files stored under a vertical-appropriate default location, so that tiles assets are not stored under a furniture-named directory while existing deployments keep working.

#### Acceptance Criteria

1. WHEN the `UPLOAD_DIR` environment variable is set, THE CRM SHALL use the configured `UPLOAD_DIR` value as the uploads root for the Active_Vertical.
2. IF the `UPLOAD_DIR` environment variable is unset and the Active_Vertical is `tiles`, THEN THE CRM SHALL use a tiles-named default uploads directory.
3. IF the `UPLOAD_DIR` environment variable is unset and the Active_Vertical is `furniture`, THEN THE CRM SHALL use the existing furniture-named default uploads directory.

### Requirement 12: Brand and Appearance Settings

**User Story:** As an administrator, I want to view and edit store identity for my vertical from a settings area, so that I can update name, logo, contacts, and colors without code changes.

#### Acceptance Criteria

1. THE Settings_Module SHALL display the current Store_Settings store name, support phone, support email, and address for the Active_Vertical.
2. WHEN an administrator submits valid changes to store name, support phone, support email, or address, THE Settings_Module SHALL persist the changes to Store_Settings.
3. THE Settings_Module SHALL allow an administrator to upload or replace the store logo for the Active_Vertical.
4. IF an administrator submits an invalid contact value (malformed email or empty store name), THEN THE Settings_Module SHALL reject the submission and display a validation message identifying the invalid field.
5. THE Settings_Module SHALL apply persisted Store_Settings values to the UI for the Active_Vertical without requiring a code deployment.
6. THE Settings_Module SHALL scope all edits to the Active_Vertical's database so that changes made in the tiles vertical do not affect the furniture vertical's Store_Settings.

### Requirement 13: Furniture Backward Compatibility and Isolation

**User Story:** As the product owner, I want the furniture vertical to be provably unaffected by the rebrand, so that existing furniture customers experience no change.

#### Acceptance Criteria

1. WHILE the Active_Vertical is `furniture`, THE CRM SHALL render brand name, logo, metadata, favicon, palette, terminology, and WhatsApp_Templates identical to the pre-rebrand furniture behavior.
2. THE CRM SHALL switch between the furniture and tiles experiences solely by the value of `BUSINESS_TYPE`, with no other configuration change required.
3. THE Tiles_Attribute_Set fields and `SQFT`/`BOX` units SHALL be additive to the data model so that existing furniture records remain valid and readable.
4. WHEN the Active_Vertical is `furniture`, THE CRM SHALL NOT set the `homzentic` Brand_Attribute on the root element.
5. THE rebrand SHALL NOT modify the Furniture_Palette Design_Token values in `app/globals.css`.

### Requirement 14: Rollout Verification

**User Story:** As the product owner, I want a defined way to verify the rebrand, so that I can confirm furniture is unchanged and tiles shows Homzentic before release.

#### Acceptance Criteria

1. WHEN the CRM starts with `BUSINESS_TYPE=tiles`, THE CRM SHALL present the Homzentic brand name, palette, and tiles terminology across the verified screens.
2. WHEN the CRM starts with `BUSINESS_TYPE=furniture` or unset, THE CRM SHALL present the Furniture_Brand name, palette, and terminology across the verified screens.
3. THE rebrand SHALL provide a documented verification checklist that compares furniture screens and behavior before and after the change for the sidebar, top bar, authentication screen, product form, quotation/invoice, and settings.
4. THE verification checklist SHALL include confirmation that switching `BUSINESS_TYPE` between `furniture` and `tiles` changes only the intended vertical's presentation.

### Requirement 15: Modern Component Library Adoption

**User Story:** As a CRM developer, I want to adopt modern components from external Component_Libraries in a controlled, compatible way, so that the interface can use contemporary UI patterns without breaking the existing styling system or the furniture vertical.

#### Acceptance Criteria

1. WHERE a Modern_Component is adopted from a Component_Library, THE CRM SHALL add the Modern_Component as a Vendored_Component placed in the Component_Directory rather than as an opaque runtime package, so that the Modern_Component remains tree-shakeable and auditable.
2. THE CRM SHALL vet each adopted Modern_Component for compatibility with the Styling_System (`@base-ui/react` primitives, Tailwind CSS v4, and the `cn()` helper) before integration.
3. THE CRM SHALL style each adopted Modern_Component using the Design_Tokens (CSS `--color-*` variables) so that the Modern_Component inherits the Active_Vertical's palette.
4. THE CRM SHALL NOT allow a Modern_Component to hardcode color values that bypass the Design_Tokens.
5. WHILE the Brand_Attribute is `homzentic`, THE CRM SHALL render adopted Modern_Components using the Homzentic_Palette Design_Token values.
6. WHEN the Active_Vertical is `furniture`, THE CRM SHALL render adopted Modern_Components using the Furniture_Palette Design_Token values and SHALL preserve the existing furniture presentation and behavior.
7. THE CRM SHALL keep adopted Modern_Components within the existing light-only theme and SHALL respect the `data-brand` scoping defined in Requirement 4.
8. WHERE an adopted Modern_Component requires an Animation_Runtime, THE CRM SHALL add the Animation_Runtime as a single shared, deduplicated dependency at one version rather than multiple competing animation libraries.
9. IF an adopted Modern_Component cannot consume the Design_Tokens or is incompatible with the Styling_System, THEN THE CRM SHALL reject the Modern_Component from integration until it is adapted to comply.

### Requirement 16: Performance Budget for the Rebrand

**User Story:** As the product owner, I want the rebrand and any modern components to keep the application fast, so that adopting new UI patterns does not degrade the user experience.

#### Acceptance Criteria

1. THE rebrand SHALL define a Performance_Budget specifying an initial route JavaScript payload limit, an LCP target, an INP target measured on a Mid_Range_Device, and a maximum added client bundle size attributable to animation and component libraries.
2. THE rebrand SHALL NOT cause any verified route to exceed the Performance_Budget limits defined in acceptance criterion 1.
3. THE CRM SHALL load each heavy or animated Modern_Component through a code-split dynamic import so that the Modern_Component is not included in the initial route JavaScript payload.
4. WHERE a Modern_Component requires no client interactivity, THE CRM SHALL render the Modern_Component as a Server Component so that Client Components remain minimal.
5. WHERE a CSS_Animation achieves the required visual effect, THE CRM SHALL use CSS_Animation in preference to a JavaScript Animation_Runtime.
6. THE CRM SHALL load the Animation_Runtime only on the routes or components that require it and SHALL NOT include the Animation_Runtime in routes that do not use it.
7. WHILE the user agent reports `prefers-reduced-motion: reduce`, THE CRM SHALL suppress or reduce non-essential animation of adopted Modern_Components.
8. THE CRM SHALL NOT apply continuous or per-row animations to large data lists or tables in a way that degrades scroll or input responsiveness.
9. THE rebrand SHALL provide a Bundle_Analysis verification step, and the verification checklist SHALL include a performance check that compares the relevant metrics before and after the change.
