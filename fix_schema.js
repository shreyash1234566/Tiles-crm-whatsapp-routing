const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

schema = schema.replace(
  `  @@index([read, createdAt]) // fetch unread notifications sorted newest-first`,
  `  sourceId  String?
  
  @@index([read, createdAt]) // fetch unread notifications sorted newest-first
  @@unique([userId, type, sourceId])`
);

fs.writeFileSync('prisma/schema.prisma', schema);
