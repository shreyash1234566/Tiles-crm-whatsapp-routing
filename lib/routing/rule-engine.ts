import { PrismaClient, RoutingRule } from '@prisma/client';
import { prisma } from '@/lib/db';

type RuleCondition = {
  field: string;
  operator: 'contains' | 'equals' | 'regex' | 'not_contains' | 'not_equals';
  value: string;
};

type RuleContext = {
  text: string;
  subject: string;
  senderJid: string;
  // Extensible for future fields
};

export async function evaluateRoutingRules(context: RuleContext): Promise<RoutingRule | null> {
  // Fetch active rules ordered by priority (highest first or lowest first depending on convention; let's assume higher number = higher priority meaning it runs earlier, wait standard is 10 > 0, so desc)
  const rules = await prisma.routingRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' }
  });

  for (const rule of rules) {
    const conditions = rule.conditions as any as RuleCondition[];
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) continue;

    let allMatch = true;

    for (const condition of conditions) {
      if (!evaluateCondition(condition, context)) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return rule;
    }
  }

  return null;
}

function evaluateCondition(condition: RuleCondition, context: RuleContext): boolean {
  let fieldValue = '';
  switch (condition.field) {
    case 'text':
      fieldValue = (context.text || '').toLowerCase();
      break;
    case 'subject':
      fieldValue = (context.subject || '').toLowerCase();
      break;
    case 'senderJid':
      fieldValue = (context.senderJid || '').toLowerCase();
      break;
    default:
      return false;
  }

  const value = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return fieldValue.includes(value);
    case 'not_contains':
      return !fieldValue.includes(value);
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'regex':
      try {
        const regex = new RegExp(condition.value, 'i');
        return regex.test(fieldValue);
      } catch (e) {
        return false;
      }
    default:
      return false;
  }
}
