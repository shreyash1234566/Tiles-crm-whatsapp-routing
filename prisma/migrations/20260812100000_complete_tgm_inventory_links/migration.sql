-- Complete the TGM inventory links without changing existing records.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "godownId" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "batchId" INTEGER;
ALTER TABLE "ProductBatch" ADD COLUMN IF NOT EXISTS "shadeCode" TEXT;

ALTER TABLE "Slab" ADD COLUMN IF NOT EXISTS "bookMatchPairId" INTEGER;

ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "sourceSlabId" INTEGER;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "sourceCustomOrderId" INTEGER;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "lengthInches" DOUBLE PRECISION;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "widthInches" DOUBLE PRECISION;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "areaSqft" DOUBLE PRECISION;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "shadeCode" TEXT;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "photo" TEXT;
ALTER TABLE "ScrapInventory" ADD COLUMN IF NOT EXISTS "salePrice" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_godownId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_godownId_fkey"
      FOREIGN KEY ("godownId") REFERENCES "Godown"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceItem_batchId_fkey') THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Slab_bookMatchPairId_fkey') THEN
    ALTER TABLE "Slab" ADD CONSTRAINT "Slab_bookMatchPairId_fkey"
      FOREIGN KEY ("bookMatchPairId") REFERENCES "Slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScrapInventory_sourceSlabId_fkey') THEN
    ALTER TABLE "ScrapInventory" ADD CONSTRAINT "ScrapInventory_sourceSlabId_fkey"
      FOREIGN KEY ("sourceSlabId") REFERENCES "Slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScrapInventory_sourceCustomOrderId_fkey') THEN
    ALTER TABLE "ScrapInventory" ADD CONSTRAINT "ScrapInventory_sourceCustomOrderId_fkey"
      FOREIGN KEY ("sourceCustomOrderId") REFERENCES "CustomOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_godownId_idx" ON "Invoice"("godownId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_batchId_idx" ON "InvoiceItem"("batchId");
CREATE INDEX IF NOT EXISTS "ProductBatch_shadeCode_idx" ON "ProductBatch"("shadeCode");
CREATE INDEX IF NOT EXISTS "Slab_bookMatchPairId_idx" ON "Slab"("bookMatchPairId");
CREATE UNIQUE INDEX IF NOT EXISTS "Slab_bookMatchPairId_key" ON "Slab"("bookMatchPairId");
CREATE INDEX IF NOT EXISTS "ScrapInventory_sourceSlabId_idx" ON "ScrapInventory"("sourceSlabId");
CREATE INDEX IF NOT EXISTS "ScrapInventory_sourceCustomOrderId_idx" ON "ScrapInventory"("sourceCustomOrderId");
