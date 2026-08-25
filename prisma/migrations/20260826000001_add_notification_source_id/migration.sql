ALTER TABLE "Notification" ADD COLUMN "sourceId" TEXT;
CREATE UNIQUE INDEX "Notification_userId_type_sourceId_key" ON "Notification"("userId", "type", "sourceId");
