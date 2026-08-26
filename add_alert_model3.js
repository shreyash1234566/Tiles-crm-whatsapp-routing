const fs = require('fs')
let file = fs.readFileSync('prisma/schema.prisma', 'utf8')
const lines = file.split('\n')

// Find the line with @@map("alert_rules")
let insertIndex = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('@@map("alert_rules")')) {
    insertIndex = i + 1
    break
  }
}

if (insertIndex > 0) {
  const alertModel = [
    '',
    'model Alert {',
    '  id        String     @id @default(cuid())',
    '  ruleId    String',
    '  rule      AlertRule  @relation(fields: [ruleId], references: [id], onDelete: Cascade)',
    '  metric    String',
    '  value     Float',
    '  severity  String',
    '  message   String     @db.Text',
    '  resolvedAt DateTime?',
    '  createdAt DateTime   @default(now())',
    '',
    '  @@index([ruleId, resolvedAt])',
    '  @@map("alerts")',
    '}'
  ]
  const newLines = [...lines.slice(0, insertIndex + 1), ...alertModel, '', ...lines.slice(insertIndex + 1)]
  fs.writeFileSync('prisma/schema.prisma', newLines.join('\n'))
  console.log('Alert model added at line', insertIndex + 1)
}
