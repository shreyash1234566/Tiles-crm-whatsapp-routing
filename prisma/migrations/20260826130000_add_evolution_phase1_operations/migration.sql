-- Phase 1 dealer-group operations.
--
-- This migration is deliberately additive and idempotent. Earlier Evolution
-- migrations created PascalCase physical tables while the Prisma schema maps
-- the production application to snake_case names. The repair below creates
-- the mapped tables when needed and copies any legacy rows without replacing
-- existing CRM, Dealer, Godown, CustomOrder, Billing, or Invoice data.

DO $$
BEGIN
  CREATE TYPE "EvolutionInquiryStage" AS ENUM (
    'NEW', 'TRIAGED', 'WORKING', 'QUOTATION', 'WAITING_FOR_DEALER',
    'CONFIRMED', 'PAYMENT_PENDING', 'ALLOCATED', 'DISPATCH_PENDING',
    'DISPATCHED', 'DELIVERED', 'CLOSED', 'ON_HOLD', 'ESCALATED', 'LOST', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "EvolutionFollowUpStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "EvolutionFollowUpStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

DO $$
BEGIN
  CREATE TYPE "EvolutionAgentRunStatus" AS ENUM ('QUEUED', 'DRAFTED', 'SENT', 'SKIPPED', 'HANDOFF', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Repair/create the physical names Prisma actually reads and writes.
CREATE TABLE IF NOT EXISTS "evolution_groups" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "groupJid" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "departmentId" INTEGER,
  "departmentName" TEXT,
  "routingReason" TEXT,
  "routeType" TEXT NOT NULL DEFAULT 'DEFAULT',
  "intent" TEXT,
  "confidence" DOUBLE PRECISION,
  "assignedUserId" INTEGER,
  "mentionPriority" BOOLEAN NOT NULL DEFAULT false,
  "lastMentionAt" TIMESTAMP(3),
  "lastMessageText" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "claimedByUserId" INTEGER,
  "claimedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_group_messages" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "senderJid" TEXT NOT NULL,
  "senderName" TEXT,
  "text" TEXT,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "mediaUrl" TEXT,
  "quotedMessageId" TEXT,
  "mentionedJids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fromMe" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'received',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_group_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_group_tickets" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "departmentId" INTEGER,
  "departmentName" TEXT,
  "assignedUserId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'open',
  "routeType" TEXT NOT NULL DEFAULT 'default',
  "lastIntent" TEXT,
  "confidence" DOUBLE PRECISION,
  "inquiryId" TEXT,
  "stage" "EvolutionInquiryStage" NOT NULL DEFAULT 'NEW',
  "assignedAt" TIMESTAMP(3),
  "firstResponseAt" TIMESTAMP(3),
  "lastResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_group_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_routing_audits" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "messageId" TEXT,
  "event" TEXT NOT NULL,
  "routeType" TEXT NOT NULL,
  "fromDepartmentId" INTEGER,
  "toDepartmentId" INTEGER,
  "confidence" DOUBLE PRECISION,
  "reason" TEXT,
  "inquiryId" TEXT,
  "actorUserId" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_routing_audits_pkey" PRIMARY KEY ("id")
);

-- Existing mapped installations need only the new additive columns.
ALTER TABLE "evolution_group_tickets"
  ADD COLUMN IF NOT EXISTS "inquiryId" TEXT,
  ADD COLUMN IF NOT EXISTS "stage" "EvolutionInquiryStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastResponseAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "evolution_routing_audits"
  ADD COLUMN IF NOT EXISTS "inquiryId" TEXT,
  ADD COLUMN IF NOT EXISTS "actorUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "evolution_dealer_inquiries"
  ADD COLUMN IF NOT EXISTS "dealerPhone" TEXT;

-- Move data written by the original PascalCase migration only when it exists.
DO $$
BEGIN
  IF to_regclass('public."EvolutionGroup"') IS NOT NULL THEN
    INSERT INTO "evolution_groups" (
      "id", "userId", "groupJid", "subject", "departmentId", "departmentName",
      "routingReason", "routeType", "intent", "confidence", "assignedUserId",
      "mentionPriority", "lastMentionAt", "lastMessageText", "lastMessageAt",
      "lastInboundAt", "unreadCount", "claimedByUserId", "claimedAt", "status",
      "createdAt", "updatedAt"
    )
    SELECT
      "id", "userId", "groupJid", "subject", "departmentId", "departmentName",
      "routingReason", "routeType", "intent", "confidence", "assignedUserId",
      "mentionPriority", "lastMentionAt", "lastMessageText", "lastMessageAt",
      "lastInboundAt", "unreadCount", "claimedByUserId", "claimedAt", "status",
      "createdAt", "updatedAt"
    FROM "EvolutionGroup"
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF to_regclass('public."EvolutionGroupMessage"') IS NOT NULL THEN
    INSERT INTO "evolution_group_messages" (
      "id", "groupId", "messageId", "senderJid", "senderName", "text",
      "messageType", "mediaUrl", "quotedMessageId", "mentionedJids", "fromMe",
      "status", "createdAt"
    )
    SELECT
      "id", "groupId", "messageId", "senderJid", "senderName", "text",
      "messageType", "mediaUrl", "quotedMessageId", "mentionedJids", "fromMe",
      "status", "createdAt"
    FROM "EvolutionGroupMessage"
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF to_regclass('public."EvolutionGroupTicket"') IS NOT NULL THEN
    INSERT INTO "evolution_group_tickets" (
      "id", "groupId", "departmentId", "departmentName", "assignedUserId", "status",
      "routeType", "lastIntent", "confidence", "createdAt", "updatedAt"
    )
    SELECT
      "id", "groupId", "departmentId", "departmentName", "assignedUserId", "status",
      "routeType", "lastIntent", "confidence", "createdAt", "updatedAt"
    FROM "EvolutionGroupTicket"
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF to_regclass('public."EvolutionRoutingAudit"') IS NOT NULL THEN
    INSERT INTO "evolution_routing_audits" (
      "id", "ticketId", "messageId", "event", "routeType", "fromDepartmentId",
      "toDepartmentId", "confidence", "reason", "createdAt"
    )
    SELECT
      "id", "ticketId", "messageId", "event", "routeType", "fromDepartmentId",
      "toDepartmentId", "confidence", "reason", "createdAt"
    FROM "EvolutionRoutingAudit"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "dealer_evolution_identities" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "dealerId" INTEGER NOT NULL,
  "groupJid" TEXT,
  "phone" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dealer_evolution_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_dealer_inquiries" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "dealerId" INTEGER,
  "dealerPhone" TEXT,
  "ownerUserId" INTEGER NOT NULL,
  "departmentId" INTEGER,
  "assignedUserId" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'EVOLUTION_GROUP',
  "title" TEXT,
  "stage" "EvolutionInquiryStage" NOT NULL DEFAULT 'NEW',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "slaDueAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "convertedOrderId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_dealer_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_ticket_follow_ups" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "inquiryId" TEXT,
  "assignedUserId" INTEGER,
  "departmentId" INTEGER,
  "channel" TEXT NOT NULL DEFAULT 'EVOLUTION_GROUP',
  "message" TEXT NOT NULL,
  "status" "EvolutionFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "error" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_ticket_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_agent_configs" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "draftOnly" BOOLEAN NOT NULL DEFAULT true,
  "allowedGroupJids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedDepartmentIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
  "maxResponseTokens" INTEGER NOT NULL DEFAULT 300,
  "responseDelayMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_agent_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_agent_runs" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT,
  "groupId" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "status" "EvolutionAgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "mode" TEXT NOT NULL DEFAULT 'DRAFT',
  "model" TEXT,
  "responseText" TEXT,
  "confidence" DOUBLE PRECISION,
  "handoff" BOOLEAN NOT NULL DEFAULT false,
  "retrievalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "providerMessageId" TEXT,
  "error" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_campaigns" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "evolution_campaign_recipients" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "dealerId" INTEGER,
  "groupJid" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "responseMessageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_groups_userId_groupJid_key" ON "evolution_groups"("userId", "groupJid");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_group_messages_groupId_messageId_key" ON "evolution_group_messages"("groupId", "messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_group_tickets_groupId_key" ON "evolution_group_tickets"("groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_group_tickets_inquiryId_key" ON "evolution_group_tickets"("inquiryId");
CREATE UNIQUE INDEX IF NOT EXISTS "dealer_evolution_identities_userId_groupJid_key" ON "dealer_evolution_identities"("userId", "groupJid");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_dealer_inquiries_groupId_key" ON "evolution_dealer_inquiries"("groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_ticket_follow_ups_idempotencyKey_key" ON "evolution_ticket_follow_ups"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_agent_configs_userId_key" ON "evolution_agent_configs"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_agent_runs_idempotencyKey_key" ON "evolution_agent_runs"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_campaign_recipients_providerMessageId_key" ON "evolution_campaign_recipients"("providerMessageId");

CREATE INDEX IF NOT EXISTS "evolution_groups_userId_departmentId_status_idx" ON "evolution_groups"("userId", "departmentId", "status");
CREATE INDEX IF NOT EXISTS "evolution_group_messages_groupId_createdAt_idx" ON "evolution_group_messages"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_group_tickets_departmentId_status_idx" ON "evolution_group_tickets"("departmentId", "status");
CREATE INDEX IF NOT EXISTS "evolution_routing_audits_ticketId_createdAt_idx" ON "evolution_routing_audits"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "dealer_evolution_identities_userId_phone_idx" ON "dealer_evolution_identities"("userId", "phone");
CREATE INDEX IF NOT EXISTS "dealer_evolution_identities_dealerId_idx" ON "dealer_evolution_identities"("dealerId");
CREATE INDEX IF NOT EXISTS "evolution_dealer_inquiries_ownerUserId_stage_lastActivityAt_idx" ON "evolution_dealer_inquiries"("ownerUserId", "stage", "lastActivityAt");
CREATE INDEX IF NOT EXISTS "evolution_dealer_inquiries_dealerId_stage_idx" ON "evolution_dealer_inquiries"("dealerId", "stage");
CREATE INDEX IF NOT EXISTS "evolution_dealer_inquiries_departmentId_stage_idx" ON "evolution_dealer_inquiries"("departmentId", "stage");
CREATE INDEX IF NOT EXISTS "evolution_dealer_inquiries_nextFollowUpAt_idx" ON "evolution_dealer_inquiries"("nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "evolution_ticket_follow_ups_status_scheduledFor_idx" ON "evolution_ticket_follow_ups"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "evolution_ticket_follow_ups_assignedUserId_scheduledFor_idx" ON "evolution_ticket_follow_ups"("assignedUserId", "scheduledFor");
CREATE INDEX IF NOT EXISTS "evolution_ticket_follow_ups_departmentId_scheduledFor_idx" ON "evolution_ticket_follow_ups"("departmentId", "scheduledFor");
CREATE INDEX IF NOT EXISTS "evolution_agent_runs_groupId_createdAt_idx" ON "evolution_agent_runs"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_agent_runs_ticketId_createdAt_idx" ON "evolution_agent_runs"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_agent_runs_status_createdAt_idx" ON "evolution_agent_runs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "evolution_campaigns_userId_status_idx" ON "evolution_campaigns"("userId", "status");
CREATE INDEX IF NOT EXISTS "evolution_campaign_recipients_campaignId_status_idx" ON "evolution_campaign_recipients"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "evolution_campaign_recipients_dealerId_idx" ON "evolution_campaign_recipients"("dealerId");
CREATE INDEX IF NOT EXISTS "evolution_campaign_recipients_groupJid_idx" ON "evolution_campaign_recipients"("groupJid");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_group_messages_groupId_fkey') THEN
    ALTER TABLE "evolution_group_messages" ADD CONSTRAINT "evolution_group_messages_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_group_tickets_groupId_fkey') THEN
    ALTER TABLE "evolution_group_tickets" ADD CONSTRAINT "evolution_group_tickets_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_routing_audits_ticketId_fkey') THEN
    ALTER TABLE "evolution_routing_audits" ADD CONSTRAINT "evolution_routing_audits_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_evolution_identities_dealerId_fkey') THEN
    ALTER TABLE "dealer_evolution_identities" ADD CONSTRAINT "dealer_evolution_identities_dealerId_fkey"
      FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_dealer_inquiries_groupId_fkey') THEN
    ALTER TABLE "evolution_dealer_inquiries" ADD CONSTRAINT "evolution_dealer_inquiries_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_dealer_inquiries_dealerId_fkey') THEN
    ALTER TABLE "evolution_dealer_inquiries" ADD CONSTRAINT "evolution_dealer_inquiries_dealerId_fkey"
      FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_group_tickets_inquiryId_fkey') THEN
    ALTER TABLE "evolution_group_tickets" ADD CONSTRAINT "evolution_group_tickets_inquiryId_fkey"
      FOREIGN KEY ("inquiryId") REFERENCES "evolution_dealer_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_routing_audits_inquiryId_fkey') THEN
    ALTER TABLE "evolution_routing_audits" ADD CONSTRAINT "evolution_routing_audits_inquiryId_fkey"
      FOREIGN KEY ("inquiryId") REFERENCES "evolution_dealer_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_ticket_follow_ups_ticketId_fkey') THEN
    ALTER TABLE "evolution_ticket_follow_ups" ADD CONSTRAINT "evolution_ticket_follow_ups_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_ticket_follow_ups_inquiryId_fkey') THEN
    ALTER TABLE "evolution_ticket_follow_ups" ADD CONSTRAINT "evolution_ticket_follow_ups_inquiryId_fkey"
      FOREIGN KEY ("inquiryId") REFERENCES "evolution_dealer_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_agent_runs_ticketId_fkey') THEN
    ALTER TABLE "evolution_agent_runs" ADD CONSTRAINT "evolution_agent_runs_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_campaign_recipients_campaignId_fkey') THEN
    ALTER TABLE "evolution_campaign_recipients" ADD CONSTRAINT "evolution_campaign_recipients_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "evolution_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
