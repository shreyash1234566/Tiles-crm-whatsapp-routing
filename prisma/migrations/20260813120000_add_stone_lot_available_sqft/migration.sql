ALTER TABLE "StoneLot"
ADD COLUMN IF NOT EXISTS "availableSqft" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "StoneLot" lot
SET "availableSqft" = COALESCE((
  SELECT SUM(s.sqft)
  FROM "Slab" s
  WHERE s."lotId" = lot.id
    AND s.status = 'AVAILABLE'
), 0);
