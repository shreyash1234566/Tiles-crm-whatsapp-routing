-- WhatsApp reaction updates are stored separately from chat messages. This
-- prevents a reaction event from being treated as a new dealer inquiry.
CREATE TABLE IF NOT EXISTS "evolution_group_reactions" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "reactionMessageId" TEXT NOT NULL,
  "targetMessageId" TEXT NOT NULL,
  "senderJid" TEXT NOT NULL,
  "senderName" TEXT,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evolution_group_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_group_reactions_reactionMessageId_key"
  ON "evolution_group_reactions"("reactionMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "evolution_group_reactions_groupId_targetMessageId_senderJid_key"
  ON "evolution_group_reactions"("groupId", "targetMessageId", "senderJid");
CREATE INDEX IF NOT EXISTS "evolution_group_reactions_groupId_targetMessageId_idx"
  ON "evolution_group_reactions"("groupId", "targetMessageId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evolution_group_reactions_groupId_fkey') THEN
    ALTER TABLE "evolution_group_reactions" ADD CONSTRAINT "evolution_group_reactions_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "evolution_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
