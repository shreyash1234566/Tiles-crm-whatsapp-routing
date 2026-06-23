-- Add nullable tiles & sanitary attributes to "Product".
-- Additive only: every column is nullable with no backfill, so existing
-- furniture rows remain valid and readable (Requirements 6.2, 6.4, 13.3).

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "tileSize" TEXT;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "finish" TEXT;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "coveragePerBox" DOUBLE PRECISION;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "tilesPerBox" INTEGER;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "surfaceType" TEXT;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "applicationArea" TEXT;
