-- Phase 2 fulfillment trace. This migration is additive and intentionally
-- leaves existing dealer, invoice, godown, and Evolution records untouched.

ALTER TABLE "DealerOrder"
  ADD COLUMN "committedDeliveryDate" TIMESTAMP(3),
  ADD COLUMN "fulfillmentGodownId" INTEGER,
  ADD COLUMN "allocationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "paymentVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "paymentVerifiedByUserId" INTEGER,
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "paymentReceiptUrl" TEXT,
  ADD COLUMN "transporterName" TEXT,
  ADD COLUMN "transportContact" TEXT,
  ADD COLUMN "lrNumber" TEXT,
  ADD COLUMN "logisticReceiptUrl" TEXT,
  ADD COLUMN "logisticReceiptName" TEXT,
  ADD COLUMN "dispatchNotes" TEXT;

ALTER TABLE "Invoice" ADD COLUMN "dealerOrderId" INTEGER;
ALTER TABLE "GodownStock" ADD COLUMN "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "DealerOrderAllocation" (
  "id" SERIAL NOT NULL,
  "dealerOrderId" INTEGER NOT NULL,
  "godownId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "lotNumber" TEXT,
  "shadeCode" TEXT,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "releasedByUserId" INTEGER,
  "dispatchedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "DealerOrderAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_fulfillment_events" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "dealerOrderId" INTEGER,
  "invoiceId" INTEGER,
  "actorUserId" INTEGER,
  "action" TEXT NOT NULL,
  "fromStage" "EvolutionInquiryStage",
  "toStage" "EvolutionInquiryStage",
  "providerMessageId" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_fulfillment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evolution_fulfillment_events_ticketId_createdAt_idx"
  ON "evolution_fulfillment_events"("ticketId", "createdAt");
CREATE INDEX "evolution_fulfillment_events_inquiryId_createdAt_idx"
  ON "evolution_fulfillment_events"("inquiryId", "createdAt");
CREATE INDEX "evolution_fulfillment_events_dealerOrderId_createdAt_idx"
  ON "evolution_fulfillment_events"("dealerOrderId", "createdAt");
CREATE INDEX "Invoice_dealerOrderId_idx" ON "Invoice"("dealerOrderId");
CREATE INDEX "DealerOrderAllocation_dealerOrderId_releasedAt_dispatchedAt_idx" ON "DealerOrderAllocation"("dealerOrderId", "releasedAt", "dispatchedAt");
CREATE INDEX "DealerOrderAllocation_godownId_productId_releasedAt_dispatchedAt_idx" ON "DealerOrderAllocation"("godownId", "productId", "releasedAt", "dispatchedAt");

ALTER TABLE "DealerOrder"
  ADD CONSTRAINT "DealerOrder_fulfillmentGodownId_fkey"
  FOREIGN KEY ("fulfillmentGodownId") REFERENCES "Godown"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_dealerOrderId_fkey"
  FOREIGN KEY ("dealerOrderId") REFERENCES "DealerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealerOrderAllocation"
  ADD CONSTRAINT "DealerOrderAllocation_dealerOrderId_fkey"
  FOREIGN KEY ("dealerOrderId") REFERENCES "DealerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerOrderAllocation"
  ADD CONSTRAINT "DealerOrderAllocation_godownId_fkey"
  FOREIGN KEY ("godownId") REFERENCES "Godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerOrderAllocation"
  ADD CONSTRAINT "DealerOrderAllocation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evolution_fulfillment_events"
  ADD CONSTRAINT "evolution_fulfillment_events_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_fulfillment_events"
  ADD CONSTRAINT "evolution_fulfillment_events_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "evolution_dealer_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_fulfillment_events"
  ADD CONSTRAINT "evolution_fulfillment_events_dealerOrderId_fkey"
  FOREIGN KEY ("dealerOrderId") REFERENCES "DealerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evolution_fulfillment_events"
  ADD CONSTRAINT "evolution_fulfillment_events_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
