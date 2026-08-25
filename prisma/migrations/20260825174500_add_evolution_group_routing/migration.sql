-- Add Evolution API group-routing support without altering existing CRM
-- modules. This migration is deliberately idempotent: some installations
-- already received these fields/tables through `prisma db push` before the
-- migration history was deployed.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "routingDepartmentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "routingPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "routingAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "RoutingDepartment" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoutingDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvolutionGroup" (
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
  CONSTRAINT "EvolutionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvolutionGroupMessage" (
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
  CONSTRAINT "EvolutionGroupMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvolutionGroupTicket" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "departmentId" INTEGER,
  "departmentName" TEXT,
  "assignedUserId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'open',
  "routeType" TEXT NOT NULL DEFAULT 'default',
  "lastIntent" TEXT,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvolutionGroupTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvolutionRoutingAudit" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "messageId" TEXT,
  "event" TEXT NOT NULL,
  "routeType" TEXT NOT NULL,
  "fromDepartmentId" INTEGER,
  "toDepartmentId" INTEGER,
  "confidence" DOUBLE PRECISION,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvolutionRoutingAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_routingPhone_key" ON "User"("routingPhone");
CREATE UNIQUE INDEX IF NOT EXISTS "RoutingDepartment_name_key" ON "RoutingDepartment"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "EvolutionGroup_userId_groupJid_key" ON "EvolutionGroup"("userId", "groupJid");
CREATE INDEX IF NOT EXISTS "EvolutionGroup_userId_departmentId_status_idx" ON "EvolutionGroup"("userId", "departmentId", "status");
CREATE INDEX IF NOT EXISTS "EvolutionGroup_userId_mentionPriority_lastMessageAt_idx" ON "EvolutionGroup"("userId", "mentionPriority", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "EvolutionGroup_groupJid_idx" ON "EvolutionGroup"("groupJid");
CREATE UNIQUE INDEX IF NOT EXISTS "EvolutionGroupMessage_groupId_messageId_key" ON "EvolutionGroupMessage"("groupId", "messageId");
CREATE INDEX IF NOT EXISTS "EvolutionGroupMessage_groupId_createdAt_idx" ON "EvolutionGroupMessage"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "EvolutionGroupMessage_messageId_idx" ON "EvolutionGroupMessage"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "EvolutionGroupTicket_groupId_key" ON "EvolutionGroupTicket"("groupId");
CREATE INDEX IF NOT EXISTS "EvolutionGroupTicket_departmentId_status_idx" ON "EvolutionGroupTicket"("departmentId", "status");
CREATE INDEX IF NOT EXISTS "EvolutionGroupTicket_routeType_createdAt_idx" ON "EvolutionGroupTicket"("routeType", "createdAt");
CREATE INDEX IF NOT EXISTS "EvolutionRoutingAudit_ticketId_createdAt_idx" ON "EvolutionRoutingAudit"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "EvolutionRoutingAudit_event_createdAt_idx" ON "EvolutionRoutingAudit"("event", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_routingDepartmentId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_routingDepartmentId_fkey"
      FOREIGN KEY ("routingDepartmentId") REFERENCES "RoutingDepartment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvolutionGroupMessage_groupId_fkey') THEN
    ALTER TABLE "EvolutionGroupMessage" ADD CONSTRAINT "EvolutionGroupMessage_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "EvolutionGroup"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvolutionGroupTicket_groupId_fkey') THEN
    ALTER TABLE "EvolutionGroupTicket" ADD CONSTRAINT "EvolutionGroupTicket_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "EvolutionGroup"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvolutionRoutingAudit_ticketId_fkey') THEN
    ALTER TABLE "EvolutionRoutingAudit" ADD CONSTRAINT "EvolutionRoutingAudit_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "EvolutionGroupTicket"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
