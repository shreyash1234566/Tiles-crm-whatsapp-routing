ALTER TABLE "dealer_evolution_identities"
  ADD COLUMN IF NOT EXISTS "marketingConsentStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "marketingOptInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marketingOptOutAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consentSource" TEXT,
  ADD COLUMN IF NOT EXISTS "consentEvidence" TEXT,
  ADD COLUMN IF NOT EXISTS "lastCampaignAt" TIMESTAMP(3);

ALTER TABLE "evolution_campaigns"
  ADD COLUMN IF NOT EXISTS "message" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "approvedByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "dealer_evolution_identities_userId_marketingConsentStatus_idx"
  ON "dealer_evolution_identities"("userId", "marketingConsentStatus");

CREATE TABLE IF NOT EXISTS "evolution_safety_configs" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "automationPaused" BOOLEAN NOT NULL DEFAULT false,
  "allOutboundPaused" BOOLEAN NOT NULL DEFAULT false,
  "pauseReason" TEXT,
  "pausedAt" TIMESTAMP(3),
  "pausedByUserId" INTEGER,
  "globalMinIntervalMs" INTEGER NOT NULL DEFAULT 2500,
  "campaignMinIntervalMs" INTEGER NOT NULL DEFAULT 10000,
  "campaignDailyLimit" INTEGER NOT NULL DEFAULT 25,
  "campaignCooldownHours" INTEGER NOT NULL DEFAULT 168,
  "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 3,
  "failureRateThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  "minimumFailureSample" INTEGER NOT NULL DEFAULT 10,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "circuitOpenUntil" TIMESTAMP(3),
  "circuitReason" TEXT,
  "lastOutboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_safety_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_safety_configs_userId_key"
  ON "evolution_safety_configs"("userId");

CREATE TABLE IF NOT EXISTS "evolution_outbound_attempts" (
  "id" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "groupJid" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT,
  "providerMessageId" TEXT,
  "error" TEXT,
  "durationMs" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_outbound_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_outbound_attempts_idempotencyKey_key"
  ON "evolution_outbound_attempts"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "evolution_outbound_attempts_ownerUserId_createdAt_idx"
  ON "evolution_outbound_attempts"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_outbound_attempts_ownerUserId_category_status_createdAt_idx"
  ON "evolution_outbound_attempts"("ownerUserId", "category", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_outbound_attempts_groupJid_createdAt_idx"
  ON "evolution_outbound_attempts"("groupJid", "createdAt");
