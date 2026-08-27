-- Phase 3 catalog automation. This is additive: imported supplier/catalog data
-- stays separate from CRM-owned product pricing and stock.

CREATE TABLE "evolution_catalog_sources" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'GOOGLE_SHEETS_CSV',
  "sourceUrl" TEXT NOT NULL,
  "sheetName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastChecksum" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_catalog_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_catalog_items" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalRowId" TEXT NOT NULL,
  "normalizedSku" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "materialCategory" TEXT,
  "tileSize" TEXT,
  "unitOfMeasure" TEXT,
  "finish" TEXT,
  "applicationArea" TEXT,
  "hsnCode" TEXT,
  "dealerPriceTier" TEXT,
  "dealerRate" INTEGER,
  "minimumQuantity" DOUBLE PRECISION,
  "availableQuantity" DOUBLE PRECISION,
  "stockStatus" TEXT,
  "lotNumber" TEXT,
  "shadeCode" TEXT,
  "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "videoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "shareable" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "productId" INTEGER,
  "sourceChecksum" TEXT NOT NULL,
  "sourceData" JSONB,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_catalog_syncs" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "sourceChecksum" TEXT,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  CONSTRAINT "evolution_catalog_syncs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_catalog_sync_errors" (
  "id" TEXT NOT NULL,
  "syncId" TEXT NOT NULL,
  "rowNumber" INTEGER,
  "externalRowId" TEXT,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rawRow" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_catalog_sync_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_catalog_conflicts" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "sourceValue" JSONB,
  "crmValue" JSONB,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "evolution_catalog_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stone_lot_media" (
  "id" TEXT NOT NULL,
  "lotId" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "mimeType" TEXT,
  "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
  "patternTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "shadeCode" TEXT,
  "qualityGrade" TEXT,
  "capturedAt" TIMESTAMP(3),
  "shareable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stone_lot_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_catalog_response_drafts" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "groupId" TEXT NOT NULL,
  "ticketId" TEXT,
  "inquiryId" TEXT,
  "requestedMessageId" TEXT,
  "catalogItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "content" TEXT NOT NULL,
  "sourceSummary" JSONB,
  "confidence" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_catalog_response_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evolution_catalog_sources_userId_sourceUrl_key" ON "evolution_catalog_sources"("userId", "sourceUrl");
CREATE UNIQUE INDEX "evolution_catalog_items_sourceId_externalRowId_key" ON "evolution_catalog_items"("sourceId", "externalRowId");
CREATE UNIQUE INDEX "stone_lot_media_lotId_url_key" ON "stone_lot_media"("lotId", "url");
CREATE INDEX "evolution_catalog_sources_userId_isActive_idx" ON "evolution_catalog_sources"("userId", "isActive");
CREATE INDEX "evolution_catalog_items_normalizedSku_active_shareable_idx" ON "evolution_catalog_items"("normalizedSku", "active", "shareable");
CREATE INDEX "evolution_catalog_items_sourceId_lastSyncedAt_idx" ON "evolution_catalog_items"("sourceId", "lastSyncedAt");
CREATE INDEX "evolution_catalog_items_productId_idx" ON "evolution_catalog_items"("productId");
CREATE INDEX "evolution_catalog_syncs_sourceId_startedAt_idx" ON "evolution_catalog_syncs"("sourceId", "startedAt");
CREATE INDEX "evolution_catalog_syncs_status_startedAt_idx" ON "evolution_catalog_syncs"("status", "startedAt");
CREATE INDEX "evolution_catalog_sync_errors_syncId_createdAt_idx" ON "evolution_catalog_sync_errors"("syncId", "createdAt");
CREATE INDEX "evolution_catalog_conflicts_catalogItemId_status_idx" ON "evolution_catalog_conflicts"("catalogItemId", "status");
CREATE INDEX "stone_lot_media_lotId_shareable_idx" ON "stone_lot_media"("lotId", "shareable");
CREATE INDEX "evolution_catalog_response_drafts_groupId_status_createdAt_idx" ON "evolution_catalog_response_drafts"("groupId", "status", "createdAt");
CREATE INDEX "evolution_catalog_response_drafts_userId_status_createdAt_idx" ON "evolution_catalog_response_drafts"("userId", "status", "createdAt");

ALTER TABLE "evolution_catalog_sources" ADD CONSTRAINT "evolution_catalog_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_items" ADD CONSTRAINT "evolution_catalog_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "evolution_catalog_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_items" ADD CONSTRAINT "evolution_catalog_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_syncs" ADD CONSTRAINT "evolution_catalog_syncs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "evolution_catalog_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_sync_errors" ADD CONSTRAINT "evolution_catalog_sync_errors_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "evolution_catalog_syncs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_conflicts" ADD CONSTRAINT "evolution_catalog_conflicts_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "evolution_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stone_lot_media" ADD CONSTRAINT "stone_lot_media_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StoneLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_response_drafts" ADD CONSTRAINT "evolution_catalog_response_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_response_drafts" ADD CONSTRAINT "evolution_catalog_response_drafts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_response_drafts" ADD CONSTRAINT "evolution_catalog_response_drafts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evolution_catalog_response_drafts" ADD CONSTRAINT "evolution_catalog_response_drafts_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "evolution_dealer_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
