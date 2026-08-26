-- Complete the additive Evolution Phase-1 contract without changing any
-- prior migration checksum or existing dealer/order data.
ALTER TABLE "evolution_dealer_inquiries"
  ADD COLUMN IF NOT EXISTS "convertedOrderId" INTEGER;

ALTER TABLE "evolution_routing_audits"
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT;

CREATE INDEX IF NOT EXISTS "evolution_dealer_inquiries_convertedOrderId_idx"
  ON "evolution_dealer_inquiries"("convertedOrderId");
CREATE INDEX IF NOT EXISTS "evolution_routing_audits_correlationId_idx"
  ON "evolution_routing_audits"("correlationId");

CREATE TABLE IF NOT EXISTS "evolution_webhook_health" (
  "id" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "lastReceivedAt" TIMESTAMP(3),
  "lastEvent" TEXT,
  "lastMessageId" TEXT,
  "lastCorrelationId" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_webhook_health_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_webhook_health_ownerUserId_key"
  ON "evolution_webhook_health"("ownerUserId");
CREATE INDEX IF NOT EXISTS "evolution_webhook_health_lastReceivedAt_idx"
  ON "evolution_webhook_health"("lastReceivedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_dealer_inquiries_convertedOrderId_fkey') THEN
    ALTER TABLE "evolution_dealer_inquiries" ADD CONSTRAINT "evolution_dealer_inquiries_convertedOrderId_fkey"
      FOREIGN KEY ("convertedOrderId") REFERENCES "DealerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
