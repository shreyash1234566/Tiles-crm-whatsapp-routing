import re

with open("app/api/evolution/webhook/route.ts", "r") as f:
    text = f.read()

search = r"const previous = await prisma.evolutionGroup\.findUnique[\s\S]+?\]\),\s*\],\s*\},"
replacement = """const routingMatches = await resolveDepartmentForMessage({ groupJid: item.groupJid, subject, text: item.text, mentionedJids: item.mentionedJids })
        const result = await prisma.$transaction(async (tx) => {
          const group = await tx.evolutionGroup.upsert({
            where: { userId_groupJid: { userId: ownerUserId, groupJid: item.groupJid } },
            update: { subject, lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: { increment: 1 } },
            create: { userId: ownerUserId, groupJid: item.groupJid, subject, lastMessageText: item.text || `[${item.messageType}]`, lastMessageAt: item.createdAt, lastInboundAt: item.createdAt, unreadCount: 1 },
          })
          const ticket = await tx.evolutionGroupTicket.upsert({
            where: { groupId: group.id },
            update: { status: 'open' },
            create: { groupId: group.id, status: 'open' },
          })

          for (const match of routingMatches) {
            if (!match.departmentId) continue
            
            const workItem = await tx.departmentWorkItem.upsert({
              where: { ticketId_departmentId_sourceMessageId: { ticketId: ticket.id, departmentId: match.departmentId, sourceMessageId: item.messageId } },
              update: {},
              create: {
                ticketId: ticket.id,
                departmentId: match.departmentId,
                departmentName: match.departmentName,
                assignedUserId: match.assignedUserId ?? null,
                status: 'open',
                routeType: match.routeType,
                routingReason: match.routingReason,
                confidence: match.confidence ?? null,
                intent: match.intent ?? null,
                mentionPriority: match.mentionPriority,
                sourceMessageId: item.messageId,
              }
            })

            const departmentSLA = await tx.departmentSLA.findUnique({ where: { departmentId: match.departmentId } });
            if (departmentSLA) {
              // @ts-ignore - calculateSLADueDates imported
              const dueDates = calculateSLADueDates(departmentSLA, item.createdAt);
              await tx.workItemSLA.upsert({
                where: { workItemId: workItem.id },
                update: { firstResponseDue: dueDates.firstResponseDue, resolutionDue: dueDates.resolutionDue },
                create: { workItemId: workItem.id, firstResponseDue: dueDates.firstResponseDue, resolutionDue: dueDates.resolutionDue }
              });
            }
            
            await tx.evolutionRoutingAudit.create({ data: { ticketId: ticket.id, messageId: item.messageId, event: 'ROUTED_WORK_ITEM', routeType: match.routeType, toDepartmentId: match.departmentId, confidence: match.confidence ?? null, reason: match.routingReason } })
          }

          const message = await tx.evolutionGroupMessage.create({ data: { groupId: group.id, messageId: item.messageId, senderJid: item.senderJid, senderName: item.senderName, text: item.text, messageType: item.messageType, mediaUrl: storedMediaUrl, quotedMessageId: item.quotedMessageId, mentionedJids: item.mentionedJids, fromMe: false, status: 'received', createdAt: item.createdAt } })
          return { message, group, routingMatches }
        })
        
        const departmentIds = result.routingMatches.map(m => m.departmentId).filter(Boolean)
        const recipients = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { id: ownerUserId },
              ...(departmentIds.length > 0 ? [{ routingDepartmentId: { in: departmentIds } }] : []),
            ],
          },"""

if re.search(search, text):
    new_text = re.sub(search, replacement, text, count=1)
    with open("app/api/evolution/webhook/route.ts", "w") as f:
        f.write(new_text)
    print("Replaced!")
else:
    print("Not found :(")
