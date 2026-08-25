const fs = require('fs');
let text = fs.readFileSync('app/actions/notifications.ts', 'utf8');

text = text.replace(
  `  await prisma.notification.updateMany({
    where: { read: false, OR: [{ userId: null }, { userId: uId }] },
    data: { read: true },
  })`,
  `  const whereClause = session.user.role === 'ADMIN'
    ? { read: false, OR: [{ userId: null }, { userId: uId }] }
    : { read: false, userId: uId }
    
  await prisma.notification.updateMany({
    where: whereClause,
    data: { read: true },
  })`
);

fs.writeFileSync('app/actions/notifications.ts', text);
