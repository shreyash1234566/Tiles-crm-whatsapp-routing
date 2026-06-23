-- Create event-level purchase payments for accurate cash flow timing
CREATE TABLE "PurchasePayment" (
  "id" SERIAL NOT NULL,
  "poId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'Bank Transfer',
  "reference" TEXT,
  "notes" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchasePayment_poId_idx" ON "PurchasePayment"("poId");
CREATE INDEX "PurchasePayment_paidAt_idx" ON "PurchasePayment"("paidAt");

ALTER TABLE "PurchasePayment"
ADD CONSTRAINT "PurchasePayment_poId_fkey"
FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill historical payment totals as single payment events using PO updatedAt when exact payment date is unknown.
INSERT INTO "PurchasePayment" ("poId", "amount", "method", "notes", "paidAt", "createdBy", "createdAt")
SELECT
  po."id",
  po."amountPaid",
  'Bank Transfer',
  'Backfilled from PurchaseOrder.amountPaid during migration',
  COALESCE(po."updatedAt", po."date", CURRENT_TIMESTAMP),
  'migration',
  CURRENT_TIMESTAMP
FROM "PurchaseOrder" po
WHERE po."amountPaid" > 0;
