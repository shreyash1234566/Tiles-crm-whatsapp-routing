const fs = require('fs')
let file = fs.readFileSync('prisma/schema.prisma', 'utf8')

// Add Alert model after AlertRule
const alertModel = `
model Alert {
  id        String   @id @default(cuid())
  ruleId    String
  rule      AlertRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  metric    String
  value     Float
  severity  String
  message   String   @db.Text
  resolvedAt DateTime?
  createdAt DateTime @default(now())

  @@index([ruleId, resolvedAt])
  @@map("alerts")
}
`

file = file.replace(
  /model AlertRule \{[\s\S]*?@@map\("alert_rules"\)\}/,
  (match) => match + '\n\n' + alertModel
)

fs.writeFileSync('prisma/schema.prisma', file)
console.log('Alert model added')
