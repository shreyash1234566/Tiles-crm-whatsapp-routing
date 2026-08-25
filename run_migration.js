const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/furniture_crm'
});

async function run() {
  await client.connect();
  try {
    await client.query('ALTER TABLE "Notification" ADD COLUMN "sourceId" TEXT;');
    console.log("Added sourceId column")
    await client.query('CREATE UNIQUE INDEX "Notification_userId_type_sourceId_key" ON "Notification"("userId", "type", "sourceId");');
    console.log("Added unique constraint")
    
    // Also record it in the prisma migrations table
    const checksum = "manual_checksum_1";
    await client.query(`
      INSERT INTO "_prisma_migrations" 
      ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") 
      VALUES 
      ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)
    `, ["20260826000001_id", checksum, "20260826000001_add_notification_source_id"]);
    
    console.log("Migration applied successfully!");
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('Migration already applied or column already exists');
    } else {
      console.error(err);
    }
  } finally {
    await client.end();
  }
}
run();
