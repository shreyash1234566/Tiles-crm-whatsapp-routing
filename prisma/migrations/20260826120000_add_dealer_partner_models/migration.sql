-- Dealer & Partners was added to the Prisma schema without a migration.
-- Keep this migration idempotent because some installations already created
-- these tables with `prisma db push` while fresh installations do not have
-- them at all.

DO $$
BEGIN
  CREATE TYPE "DealerStatus" AS ENUM (
    'PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'CATALOGUE_SHARED',
    'PRICE_LIST_SHARED', 'TRIAL_ORDER', 'ACTIVE', 'DORMANT',
    'NOT_INTERESTED', 'LOST'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DealerTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DealerOrderStatus" AS ENUM (
    'ENQUIRY', 'QUOTATION_SHARED', 'ORDER_RECEIVED', 'APPROVAL_PENDING',
    'APPROVED', 'ALLOCATED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DealerClaimStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Dealer" (
  "id" SERIAL NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactPerson" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "alternatePhone" TEXT,
  "whatsappNumber" TEXT,
  "email" TEXT,
  "gstNumber" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "pincode" TEXT,
  "territory" TEXT,
  "dealerType" TEXT NOT NULL DEFAULT 'Retailer',
  "status" "DealerStatus" NOT NULL DEFAULT 'PROSPECT',
  "preferredCategories" JSONB,
  "estimatedMonthlyBusiness" INTEGER NOT NULL DEFAULT 0,
  "monthlySalesTarget" INTEGER NOT NULL DEFAULT 0,
  "performanceTier" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  "creditLimit" INTEGER NOT NULL DEFAULT 0,
  "creditDays" INTEGER NOT NULL DEFAULT 0,
  "paymentTerms" TEXT,
  "priceTier" TEXT NOT NULL DEFAULT 'STANDARD',
  "defaultDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "assignedStaffId" INTEGER,
  "source" TEXT,
  "lastContactAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerStaffAssignment" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "staffId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerTask" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "assignedStaffId" INTEGER,
  "type" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "reminderAt" TIMESTAMP(3),
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" "DealerTaskStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerVisit" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "staffId" INTEGER,
  "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purpose" TEXT NOT NULL,
  "personMet" TEXT,
  "outcome" TEXT,
  "nextAction" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "nextMeetingAt" TIMESTAMP(3),
  "samplesShown" TEXT,
  "priceListShared" BOOLEAN NOT NULL DEFAULT false,
  "dealerFeedback" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerOrder" (
  "id" SERIAL NOT NULL,
  "displayId" TEXT NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "status" "DealerOrderStatus" NOT NULL DEFAULT 'ENQUIRY',
  "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDispatchDate" TIMESTAMP(3),
  "paymentDueDate" TIMESTAMP(3),
  "dispatchDate" TIMESTAMP(3),
  "deliveryDate" TIMESTAMP(3),
  "subtotal" INTEGER NOT NULL DEFAULT 0,
  "discount" INTEGER NOT NULL DEFAULT 0,
  "gst" INTEGER NOT NULL DEFAULT 0,
  "freight" INTEGER NOT NULL DEFAULT 0,
  "loading" INTEGER NOT NULL DEFAULT 0,
  "installation" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "amountPaid" INTEGER NOT NULL DEFAULT 0,
  "balanceDue" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" INTEGER NOT NULL DEFAULT 0,
  "marginAmount" INTEGER NOT NULL DEFAULT 0,
  "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "salespersonId" INTEGER,
  "deliveryAddress" TEXT,
  "allocationNotes" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerOrderItem" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "productId" INTEGER,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unitOfMeasure" TEXT NOT NULL DEFAULT 'PCS',
  "areaSqft" DOUBLE PRECISION,
  "rate" INTEGER NOT NULL DEFAULT 0,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "costRate" INTEGER NOT NULL DEFAULT 0,
  "marginAmount" INTEGER NOT NULL DEFAULT 0,
  "shadeCode" TEXT,
  "lotNumber" TEXT,
  "notes" TEXT,
  CONSTRAINT "DealerOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerPayment" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "dealerOrderId" INTEGER,
  "amount" INTEGER NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'Bank Transfer',
  "reference" TEXT,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerClaim" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "dealerOrderId" INTEGER,
  "assignedStaffId" INTEGER,
  "type" TEXT NOT NULL DEFAULT 'DAMAGE',
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION,
  "claimAmount" INTEGER NOT NULL DEFAULT 0,
  "status" "DealerClaimStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "replacementStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "replacementNotes" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerActivity" (
  "id" SERIAL NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "staffId" INTEGER,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerPriceList" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "dealerId" INTEGER,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerPriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DealerPriceListItem" (
  "id" SERIAL NOT NULL,
  "priceListId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "rate" INTEGER NOT NULL,
  "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  CONSTRAINT "DealerPriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Dealer_status_idx" ON "Dealer"("status");
CREATE INDEX IF NOT EXISTS "Dealer_assignedStaffId_idx" ON "Dealer"("assignedStaffId");
CREATE INDEX IF NOT EXISTS "Dealer_territory_idx" ON "Dealer"("territory");
CREATE INDEX IF NOT EXISTS "Dealer_phone_idx" ON "Dealer"("phone");
CREATE INDEX IF NOT EXISTS "DealerStaffAssignment_dealerId_role_idx" ON "DealerStaffAssignment"("dealerId", "role");
CREATE INDEX IF NOT EXISTS "DealerStaffAssignment_staffId_role_idx" ON "DealerStaffAssignment"("staffId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "DealerStaffAssignment_dealerId_staffId_role_key" ON "DealerStaffAssignment"("dealerId", "staffId", "role");
CREATE INDEX IF NOT EXISTS "DealerTask_dealerId_status_idx" ON "DealerTask"("dealerId", "status");
CREATE INDEX IF NOT EXISTS "DealerTask_assignedStaffId_dueDate_idx" ON "DealerTask"("assignedStaffId", "dueDate");
CREATE INDEX IF NOT EXISTS "DealerTask_dueDate_status_idx" ON "DealerTask"("dueDate", "status");
CREATE INDEX IF NOT EXISTS "DealerVisit_dealerId_visitDate_idx" ON "DealerVisit"("dealerId", "visitDate");
CREATE INDEX IF NOT EXISTS "DealerVisit_staffId_visitDate_idx" ON "DealerVisit"("staffId", "visitDate");
CREATE UNIQUE INDEX IF NOT EXISTS "DealerOrder_displayId_key" ON "DealerOrder"("displayId");
CREATE INDEX IF NOT EXISTS "DealerOrder_dealerId_status_idx" ON "DealerOrder"("dealerId", "status");
CREATE INDEX IF NOT EXISTS "DealerOrder_orderDate_idx" ON "DealerOrder"("orderDate");
CREATE INDEX IF NOT EXISTS "DealerOrder_paymentStatus_idx" ON "DealerOrder"("paymentStatus");
CREATE INDEX IF NOT EXISTS "DealerOrder_salespersonId_idx" ON "DealerOrder"("salespersonId");
CREATE INDEX IF NOT EXISTS "DealerOrderItem_orderId_idx" ON "DealerOrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "DealerOrderItem_productId_idx" ON "DealerOrderItem"("productId");
CREATE INDEX IF NOT EXISTS "DealerPayment_dealerId_paymentDate_idx" ON "DealerPayment"("dealerId", "paymentDate");
CREATE INDEX IF NOT EXISTS "DealerPayment_dealerOrderId_idx" ON "DealerPayment"("dealerOrderId");
CREATE INDEX IF NOT EXISTS "DealerClaim_dealerId_status_idx" ON "DealerClaim"("dealerId", "status");
CREATE INDEX IF NOT EXISTS "DealerClaim_assignedStaffId_idx" ON "DealerClaim"("assignedStaffId");
CREATE INDEX IF NOT EXISTS "DealerActivity_dealerId_createdAt_idx" ON "DealerActivity"("dealerId", "createdAt");
CREATE INDEX IF NOT EXISTS "DealerPriceList_dealerId_isActive_idx" ON "DealerPriceList"("dealerId", "isActive");
CREATE INDEX IF NOT EXISTS "DealerPriceListItem_productId_idx" ON "DealerPriceListItem"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "DealerPriceListItem_priceListId_productId_key" ON "DealerPriceListItem"("priceListId", "productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dealer_assignedStaffId_fkey') THEN
    ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerStaffAssignment_dealerId_fkey') THEN
    ALTER TABLE "DealerStaffAssignment" ADD CONSTRAINT "DealerStaffAssignment_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerStaffAssignment_staffId_fkey') THEN
    ALTER TABLE "DealerStaffAssignment" ADD CONSTRAINT "DealerStaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerTask_dealerId_fkey') THEN
    ALTER TABLE "DealerTask" ADD CONSTRAINT "DealerTask_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerTask_assignedStaffId_fkey') THEN
    ALTER TABLE "DealerTask" ADD CONSTRAINT "DealerTask_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerVisit_dealerId_fkey') THEN
    ALTER TABLE "DealerVisit" ADD CONSTRAINT "DealerVisit_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerVisit_staffId_fkey') THEN
    ALTER TABLE "DealerVisit" ADD CONSTRAINT "DealerVisit_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerOrder_dealerId_fkey') THEN
    ALTER TABLE "DealerOrder" ADD CONSTRAINT "DealerOrder_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerOrder_salespersonId_fkey') THEN
    ALTER TABLE "DealerOrder" ADD CONSTRAINT "DealerOrder_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerOrderItem_orderId_fkey') THEN
    ALTER TABLE "DealerOrderItem" ADD CONSTRAINT "DealerOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DealerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerOrderItem_productId_fkey') THEN
    ALTER TABLE "DealerOrderItem" ADD CONSTRAINT "DealerOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerPayment_dealerId_fkey') THEN
    ALTER TABLE "DealerPayment" ADD CONSTRAINT "DealerPayment_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerPayment_dealerOrderId_fkey') THEN
    ALTER TABLE "DealerPayment" ADD CONSTRAINT "DealerPayment_dealerOrderId_fkey" FOREIGN KEY ("dealerOrderId") REFERENCES "DealerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerClaim_dealerId_fkey') THEN
    ALTER TABLE "DealerClaim" ADD CONSTRAINT "DealerClaim_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerClaim_dealerOrderId_fkey') THEN
    ALTER TABLE "DealerClaim" ADD CONSTRAINT "DealerClaim_dealerOrderId_fkey" FOREIGN KEY ("dealerOrderId") REFERENCES "DealerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerClaim_assignedStaffId_fkey') THEN
    ALTER TABLE "DealerClaim" ADD CONSTRAINT "DealerClaim_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerActivity_dealerId_fkey') THEN
    ALTER TABLE "DealerActivity" ADD CONSTRAINT "DealerActivity_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerPriceList_dealerId_fkey') THEN
    ALTER TABLE "DealerPriceList" ADD CONSTRAINT "DealerPriceList_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerPriceListItem_priceListId_fkey') THEN
    ALTER TABLE "DealerPriceListItem" ADD CONSTRAINT "DealerPriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "DealerPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerPriceListItem_productId_fkey') THEN
    ALTER TABLE "DealerPriceListItem" ADD CONSTRAINT "DealerPriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
