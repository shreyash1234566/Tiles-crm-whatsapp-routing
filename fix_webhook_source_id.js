const fs = require('fs');
let text = fs.readFileSync('app/api/evolution/webhook/route.ts', 'utf8');

text = text.replace(
  `              href: '/routing-crm?group_id=' + result.group.id,\n            }`,
  `              href: '/routing-crm?group_id=' + result.group.id,\n              sourceId: item.messageId,\n            }`
);

fs.writeFileSync('app/api/evolution/webhook/route.ts', text);
