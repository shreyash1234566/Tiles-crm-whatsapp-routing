const fs = require('fs');
let text = fs.readFileSync('app/actions/notifications.ts', 'utf8');

text = text.replace(
  `  if (!n) return { success: false, error: 'Not found' }
  if (n.userId !== null && n.userId !== uId) {
    return { success: false, error: 'Unauthorized' }
  }`,
  `  if (!n) return { success: false, error: 'Not found' }
  if (n.userId !== null && n.userId !== uId) {
    return { success: false, error: 'Unauthorized' }
  }
  if (n.userId === null && session.user.role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized - Only Admins can dismiss global alerts' }
  }`
);

fs.writeFileSync('app/actions/notifications.ts', text);
