const fs = require('fs');
const content = fs.readFileSync('lib/evolution-routing.ts', 'utf8');

let newContent = content.replace(
  /export async function resolveDepartmentForMessage\(input.*?\{(\n.*?)*?return \{ departmentId: null, departmentName: null.*?\n\}/,
`export async function resolveDepartmentForMessage(input: {
  groupJid: string
  subject: string
  text: string | null
  mentionedJids: string[]
  existingDepartmentIds?: number[]
}): Promise<DepartmentMatch[]> {
  const departments = await prisma.routingDepartment.findMany({
    where: { isActive: true },
    include: { users: { where: { isActive: true, staff: { status: 'Active' } }, select: { id: true, name: true, routingPhone: true, routingAliases: true, staff: { select: { name: true } } } } },
    orderBy: { id: 'asc' },
  })
  const haystack = \`\${input.subject} \${input.text || ''}\`.toLowerCase()
  const mentionedJids = new Set(input.mentionedJids.map(normalizePhoneJid))
  const businessAliases = (process.env.EVOLUTION_BUSINESS_ALIASES || '').split(',').map((value) => value.trim()).filter(Boolean)
  const businessMention = businessAliases.some((alias) => containsPhrase(haystack, alias))

  const matches: DepartmentMatch[] = []
  const seenDepartments = new Set<number>()

  function addMatch(match: DepartmentMatch) {
    if (match.departmentId !== null && !seenDepartments.has(match.departmentId)) {
      matches.push(match)
      seenDepartments.add(match.departmentId)
    } else if (match.departmentId === null && matches.length === 0) {
      matches.push(match)
    }
  }

  // Explicit @tag or a person/profile alias always wins over keywords and AI.
  for (const department of departments) {
    for (const user of department.users) {
      const aliases = [user.name, user.staff?.name, ...(user.routingAliases || [])].filter((value): value is string => Boolean(value))
      const directMention = Boolean(user.routingPhone && mentionedJids.has(normalizePhoneJid(user.routingPhone))) || aliases.some((alias) => containsPhrase(haystack, alias))
      if (directMention) addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'direct-person-mention', routeType: 'DIRECT_MENTION', mentionPriority: true, assignedUserId: user.id, confidence: 1, intent: null })
    }
  }
  if (matches.length > 0) return matches

  // Check custom routing rules
  const ruleContext = {
    text: input.text || '',
    subject: input.subject,
    senderJid: input.mentionedJids.length > 0 ? input.mentionedJids[0] : ''
  };

  const ruleMatch = await evaluateRoutingRules(ruleContext);
  if (ruleMatch) {
    const dName = departments.find(d => d.id === ruleMatch.departmentId)?.name || 'Custom Rule routing'
    addMatch({ departmentId: ruleMatch.departmentId, departmentName: dName, routingReason: \`rule-\${ruleMatch.id}\`, routeType: 'KEYWORD', mentionPriority: businessMention, confidence: 1, intent: null });
  }
  if (matches.length > 0) return matches

  // Human-readable department names and configured aliases are deterministic.
  for (const department of departments) {
    const aliases = department.users.flatMap((user) => user.routingAliases || [])
    if (containsPhrase(haystack, department.name) || aliases.some((alias) => containsPhrase(haystack, alias))) {
      addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'department-keyword', routeType: 'KEYWORD', mentionPriority: businessMention || aliases.some((alias) => containsPhrase(haystack, alias)), confidence: 1, intent: null })
    }
  }
  if (matches.length > 0) return matches

  // Only ambiguous/no-keyword messages reach the LLM. A confident result can hand off
  // an existing thread; an unclear result preserves its current department.
  const intent = await classifyIntent(input.text || input.subject)
  if (intent.department !== 'unclear' && intent.confidence >= 0.7) {
    const department = departments.find((candidate) => candidate.name.toLowerCase() === intent.department)
    if (department) addMatch({ departmentId: department.id, departmentName: department.name, routingReason: 'ai-classified', routeType: 'AI_CLASSIFIED', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
  }
  if (matches.length > 0) return matches

  if (input.existingDepartmentIds && input.existingDepartmentIds.length > 0) {
    for (const dId of input.existingDepartmentIds) {
      const existing = departments.find((department) => department.id === dId)
      if (existing) addMatch({ departmentId: existing.id, departmentName: existing.name, routingReason: 'existing-group-mapping', routeType: 'EXISTING', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
    }
  }
  if (matches.length > 0) return matches

  const fallback = departments.find((department) => department.name.toLowerCase() === 'sales') || departments[0]
  if (fallback) addMatch({ departmentId: fallback.id, departmentName: fallback.name, routingReason: 'default-sales-fallback', routeType: 'DEFAULT', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })

  if (matches.length === 0) {
    addMatch({ departmentId: null, departmentName: null, routingReason: 'no-active-department', routeType: 'DEFAULT', mentionPriority: businessMention, confidence: intent.confidence, intent: intent.department })
  }

  return matches
}`
);

fs.writeFileSync('lib/evolution-routing.ts', newContent);
