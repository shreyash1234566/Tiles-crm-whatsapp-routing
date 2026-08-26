const fs = require('fs')
let file = fs.readFileSync('prisma/schema.prisma', 'utf8')

const alertModel = `
model Alert {
  id        String     @id @default(cuid())
  ruleId    String
  rule      AlertRule  @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  metric    String
  value     Float
  severity  String
  message   String     @db.Text
  resolvedAt DateTime?
  createdAt DateTime   @default(now())

  @@index([ruleId, resolvedAt])
  @@map("alerts")
}
`

// Find the exact pattern
const idx = file.indexOf('@@map("alert_rules")}\n\n// ─── GROUP TICKET ROUTING ENHANCEMENTS')
if (idx === -1) {
  console.log('Pattern not found, trying alternative...')
  // Try another pattern
  const idx2 = file.indexOf('@@map("alert_rules")}')
  if (idx2 !== -1) {
    // Insert after this
    file = file.slice(0, idx2 + 22) + '\n' + alertModel + '\n' + file.slice(idx2 + 22)
  }
} else {
  file = file.slice(0, idx + 22) + '\n' + alertModel + '\n' + file.slice(idx + 22)
}

fs.writeFileSync('prisma/schema.prisma', file)
console.log('Alert model added')
