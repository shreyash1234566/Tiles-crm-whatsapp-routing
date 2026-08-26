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

// Find the position right after AlertRule's @@map("alert_rules")
const searchStr = '@@map("alert_rules")}\n\n// ─── GROUP TICKET ROUTING ENHANCEMENTS'
const replaceStr = '@@map("alert_rules")}\n' + alertModel + '\n// ─── GROUP TICKET ROUTING ENHANCEMENTS'

file = file.replace(searchStr, replaceStr)

fs.writeFileSync('prisma/schema.prisma', file)
console.log('Alert model added')
