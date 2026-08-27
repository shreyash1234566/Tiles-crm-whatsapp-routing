-- Phase 3 follow-up. This migration is forward-only so a VPS that already
-- applied the catalog base migration can safely receive scheduled sync, local
-- vision, and operational telemetry without rewriting migration history.

ALTER TABLE "StoneLot" ADD COLUMN IF NOT EXISTS "shareable" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_catalog_response_drafts_groupId_requestedMessageId_key"
  ON "evolution_catalog_response_drafts"("groupId", "requestedMessageId");

CREATE TABLE IF NOT EXISTS "evolution_vision_embeddings" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "catalogItemId" TEXT,
  "lotMediaId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dimension" INTEGER NOT NULL,
  "embedding" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_vision_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_vision_matches" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "groupId" TEXT,
  "requestedMessageId" TEXT,
  "querySourceUrl" TEXT NOT NULL,
  "querySourceHash" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "confidenceBand" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
  "reviewedByUserId" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_vision_matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_worker_metrics" (
  "id" TEXT NOT NULL,
  "userId" INTEGER,
  "queue" TEXT NOT NULL,
  "jobId" TEXT,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "durationMs" INTEGER,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_worker_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_vision_embeddings_userId_model_sourceHash_catalogItemId_key" ON "evolution_vision_embeddings"("userId", "model", "sourceHash", "catalogItemId");
CREATE INDEX IF NOT EXISTS "evolution_vision_embeddings_userId_catalogItemId_idx" ON "evolution_vision_embeddings"("userId", "catalogItemId");
CREATE INDEX IF NOT EXISTS "evolution_vision_embeddings_userId_lotMediaId_idx" ON "evolution_vision_embeddings"("userId", "lotMediaId");
CREATE INDEX IF NOT EXISTS "evolution_vision_matches_userId_groupId_createdAt_idx" ON "evolution_vision_matches"("userId", "groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_vision_matches_candidateId_createdAt_idx" ON "evolution_vision_matches"("candidateId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_worker_metrics_queue_createdAt_idx" ON "evolution_worker_metrics"("queue", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_worker_metrics_userId_createdAt_idx" ON "evolution_worker_metrics"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_worker_metrics_status_createdAt_idx" ON "evolution_worker_metrics"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "evolution_vision_embeddings" ADD CONSTRAINT "evolution_vision_embeddings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_embeddings" ADD CONSTRAINT "evolution_vision_embeddings_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "evolution_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_embeddings" ADD CONSTRAINT "evolution_vision_embeddings_lotMediaId_fkey" FOREIGN KEY ("lotMediaId") REFERENCES "stone_lot_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_matches" ADD CONSTRAINT "evolution_vision_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_matches" ADD CONSTRAINT "evolution_vision_matches_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_matches" ADD CONSTRAINT "evolution_vision_matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_vision_matches" ADD CONSTRAINT "evolution_vision_matches_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "evolution_vision_embeddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "evolution_worker_metrics" ADD CONSTRAINT "evolution_worker_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
