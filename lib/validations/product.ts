import { z } from 'zod'

/**
 * Tiles & Sanitary attribute value sets (Requirement 6.5, 6.6).
 * Exported so the product form can render the same selectable options
 * it validates against.
 */
export const FINISH_VALUES = ['glossy', 'matte', 'rustic'] as const
export const APPLICATION_AREA_VALUES = ['floor', 'wall', 'bathroom'] as const

/**
 * Unit-of-measure options surfaced for the tiles vertical: `SQFT` and `BOX`
 * in addition to the default `PCS` (Requirement 6.3, 6.4). The schema itself
 * keeps `unitOfMeasure` permissive (plain string) so existing furniture /
 * raw-material units (KG, L, M, SET, ROLL, …) remain valid; the curated set
 * below drives the tiles UI only.
 */
export const TILES_UNIT_VALUES = ['PCS', 'SQFT', 'BOX'] as const

/** Treat empty strings / null as "not provided" so optional tiles fields stay optional. */
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().min(0, 'Price must be positive'),
  costPrice: z.number().min(0).default(0),
  stock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(5),
  material: z.string().optional(),
  brand: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  warehouse: z.string().optional(),
  image: z.string().optional(),
  // Accepts PCS (default), plus SQFT / BOX for tiles and existing furniture units.
  unitOfMeasure: z.string().default('PCS'),
  unitSize: z.number().positive().default(1),
  godownId: z.number().optional(), // Which godown receives the initial stock

  // ── Tiles & Sanitary attributes (nullable, additive — Requirement 6.1, 6.2) ──
  tileSize: z.preprocess(emptyToUndefined, z.string().optional()),
  finish: z.preprocess(
    emptyToUndefined,
    z.enum(FINISH_VALUES, { message: 'Finish must be glossy, matte, or rustic' }).optional(),
  ),
  coveragePerBox: z.preprocess(emptyToUndefined, z.number().positive().optional()),
  tilesPerBox: z.preprocess(emptyToUndefined, z.number().int().positive().optional()),
  surfaceType: z.preprocess(emptyToUndefined, z.string().optional()),
  applicationArea: z.preprocess(
    emptyToUndefined,
    z
      .enum(APPLICATION_AREA_VALUES, {
        message: 'Application area must be floor, wall, or bathroom',
      })
      .optional(),
  ),
})

export const updateStockSchema = z.object({
  id: z.number(),
  stock: z.number().min(0),
  godownId: z.number().optional(), // Which godown to adjust
})

export type CreateProductInput = z.infer<typeof createProductSchema>
