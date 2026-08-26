-- Department-scoped WhatsApp responsibilities. This is additive: existing
-- groups/tickets remain intact for historical compatibility and no data is
-- deleted or rewritten by this migration.
CREATE TABLE "evolution_department_work_items" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "departmentId" INTEGER,
    "departmentName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedUserId" INTEGER,
    "claimedByUserId" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "routingReason" TEXT,
    "routeType" TEXT NOT NULL DEFAULT 'DEFAULT',
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "mentionPriority" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageText" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneByUserId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evolution_department_work_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_department_work_item_messages" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evolution_department_work_item_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_department_work_item_audits" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "messageId" TEXT,
    "actorUserId" INTEGER,
    "event" TEXT NOT NULL,
    "fromDepartmentId" INTEGER,
    "toDepartmentId" INTEGER,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evolution_department_work_item_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evolution_department_work_item_messages_workItemId_messageId_key"
  ON "evolution_department_work_item_messages"("workItemId", "messageId");
CREATE INDEX "evolution_department_work_items_groupId_status_idx"
  ON "evolution_department_work_items"("groupId", "status");
CREATE INDEX "evolution_department_work_items_ticketId_departmentId_status_idx"
  ON "evolution_department_work_items"("ticketId", "departmentId", "status");
CREATE INDEX "evolution_department_work_items_departmentId_status_lastMessageAt_idx"
  ON "evolution_department_work_items"("departmentId", "status", "lastMessageAt");
CREATE INDEX "evolution_department_work_items_assignedUserId_status_idx"
  ON "evolution_department_work_items"("assignedUserId", "status");
CREATE INDEX "evolution_department_work_item_messages_messageId_idx"
  ON "evolution_department_work_item_messages"("messageId");
CREATE INDEX "evolution_department_work_item_audits_workItemId_createdAt_idx"
  ON "evolution_department_work_item_audits"("workItemId", "createdAt");
CREATE INDEX "evolution_department_work_item_audits_event_createdAt_idx"
  ON "evolution_department_work_item_audits"("event", "createdAt");

ALTER TABLE "evolution_department_work_items"
  ADD CONSTRAINT "evolution_department_work_items_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_department_work_items"
  ADD CONSTRAINT "evolution_department_work_items_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "evolution_group_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_department_work_item_messages"
  ADD CONSTRAINT "evolution_department_work_item_messages_workItemId_fkey"
  FOREIGN KEY ("workItemId") REFERENCES "evolution_department_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_department_work_item_messages"
  ADD CONSTRAINT "evolution_department_work_item_messages_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "evolution_group_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_department_work_item_audits"
  ADD CONSTRAINT "evolution_department_work_item_audits_workItemId_fkey"
  FOREIGN KEY ("workItemId") REFERENCES "evolution_department_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing shared-group tickets have no reliable historic per-message
-- department boundary. Preserve them for manager review, but deliberately do
-- not assign them to staff or attach their mixed transcript to a department.
-- New inbound messages create correctly scoped work items from this point on.
INSERT INTO "evolution_department_work_items" (
  "id", "groupId", "ticketId", "departmentId", "departmentName", "status",
  "routingReason", "routeType", "lastMessageText", "lastMessageAt", "unreadCount",
  "createdAt", "updatedAt"
)
SELECT
  'legacy-review-' || ticket."id", ticket."groupId", ticket."id", NULL, 'Manager review', 'ACTIVE',
  'Legacy shared-group history requires manager review before staff assignment', 'LEGACY_REVIEW',
  group_row."lastMessageText", group_row."lastMessageAt", 0,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "evolution_group_tickets" AS ticket
JOIN "evolution_groups" AS group_row ON group_row."id" = ticket."groupId"
WHERE NOT EXISTS (
  SELECT 1 FROM "evolution_department_work_items" AS item WHERE item."ticketId" = ticket."id"
);
