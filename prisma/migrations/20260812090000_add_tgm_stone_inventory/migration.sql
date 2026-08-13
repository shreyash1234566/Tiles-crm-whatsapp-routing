-- Tiles, Granite & Marble (TGM) vertical: additive serialized stone inventory,
-- measured invoice lines and fabrication-job metadata. Existing furniture data
-- remains untouched.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "materialCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "isSlabTracked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "origin" TEXT,
  ADD COLUMN IF NOT EXISTS "thicknessMm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "qualityGrade" TEXT,
  ADD COLUMN IF NOT EXISTS "bookMatchPair" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "QuotationItem"
  ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT NOT NULL DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS "areaSqft" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coveragePerBox" DOUBLE PRECISION;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "freightCharge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "loadingCharge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "roadPermit" TEXT;

ALTER TABLE "InvoiceItem"
  ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT NOT NULL DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS "areaSqft" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coveragePerBox" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "slabId" INTEGER;

ALTER TABLE "CustomOrder"
  ADD COLUMN IF NOT EXISTS "installationType" TEXT,
  ADD COLUMN IF NOT EXISTS "edgeProfile" TEXT,
  ADD COLUMN IF NOT EXISTS "cutouts" JSONB,
  ADD COLUMN IF NOT EXISTS "templateMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "areaSqft" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "wastagePercent" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "StoneLot" (
  "id" SERIAL NOT NULL,
  "lotNumber" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "supplierId" INTEGER,
  "origin" TEXT,
  "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalSlabs" INTEGER NOT NULL DEFAULT 0,
  "totalSqft" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgThicknessMm" DOUBLE PRECISION,
  "shadeCode" TEXT,
  "qualityGrade" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
  "costPerSqft" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoneLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Slab" (
  "id" SERIAL NOT NULL,
  "lotId" INTEGER NOT NULL,
  "slabNumber" TEXT NOT NULL,
  "lengthInches" DOUBLE PRECISION NOT NULL,
  "widthInches" DOUBLE PRECISION NOT NULL,
  "sqft" DOUBLE PRECISION NOT NULL,
  "thicknessMm" DOUBLE PRECISION,
  "photo" TEXT,
  "qcGrade" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "godownId" INTEGER,
  "bookMatchPairId" INTEGER,
  "reservedForOrderId" INTEGER,
  "reservedForCustomId" INTEGER,
  "soldPrice" INTEGER,
  "soldAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Slab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SampleLoan" (
  "id" SERIAL NOT NULL,
  "contactId" INTEGER NOT NULL,
  "productId" INTEGER,
  "slabId" INTEGER,
  "checkoutDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedReturn" TIMESTAMP(3),
  "returnedDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OUT',
  "notes" TEXT,
  CONSTRAINT "SampleLoan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoneLot_lotNumber_key" ON "StoneLot"("lotNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Slab_lotId_slabNumber_key" ON "Slab"("lotId", "slabNumber");
CREATE INDEX IF NOT EXISTS "StoneLot_productId_idx" ON "StoneLot"("productId");
CREATE INDEX IF NOT EXISTS "StoneLot_status_idx" ON "StoneLot"("status");
CREATE INDEX IF NOT EXISTS "StoneLot_shadeCode_idx" ON "StoneLot"("shadeCode");
CREATE INDEX IF NOT EXISTS "Slab_status_idx" ON "Slab"("status");
CREATE INDEX IF NOT EXISTS "Slab_godownId_idx" ON "Slab"("godownId");
CREATE INDEX IF NOT EXISTS "Slab_lotId_status_idx" ON "Slab"("lotId", "status");
CREATE INDEX IF NOT EXISTS "SampleLoan_contactId_idx" ON "SampleLoan"("contactId");
CREATE INDEX IF NOT EXISTS "SampleLoan_status_idx" ON "SampleLoan"("status");
CREATE INDEX IF NOT EXISTS "SampleLoan_slabId_idx" ON "SampleLoan"("slabId");

DO $$ BEGIN
  ALTER TABLE "StoneLot" ADD CONSTRAINT "StoneLot_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StoneLot" ADD CONSTRAINT "StoneLot_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Slab" ADD CONSTRAINT "Slab_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "StoneLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Slab" ADD CONSTRAINT "Slab_godownId_fkey"
    FOREIGN KEY ("godownId") REFERENCES "Godown"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Slab" ADD CONSTRAINT "Slab_reservedForCustomId_fkey"
    FOREIGN KEY ("reservedForCustomId") REFERENCES "CustomOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_slabId_fkey"
    FOREIGN KEY ("slabId") REFERENCES "Slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SampleLoan" ADD CONSTRAINT "SampleLoan_slabId_fkey"
    FOREIGN KEY ("slabId") REFERENCES "Slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
