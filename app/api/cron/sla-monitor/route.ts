import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publishEvent } from '@/lib/redis';

export async function GET(request: Request) {
  try {
    // Basic auth check for cron jobs if needed
    const authHeader = request.headers.get('authorization');
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    // Find active tickets that are breaching SLA
    const breachedTickets = await prisma.ticketSLA.findMany({
      where: {
        OR: [
          {
            firstResponseDue: { lt: now },
            firstRespondedAt: null,
            breachedFirstResponse: false
          },
          {
            resolutionDue: { lt: now },
            resolvedAt: null,
            breachedResolution: false
          }
        ]
      },
      include: {
        ticket: {
          include: {
            group: true,
            notes: {
              take: 1,
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (breachedTickets.length === 0) {
      return NextResponse.json({ success: true, message: 'No new breaches found' });
    }

    for (const sla of breachedTickets) {
      const isFirstResponseBreach = !sla.breachedFirstResponse && sla.firstResponseDue && sla.firstResponseDue < now && !sla.firstRespondedAt;
      const isResolutionBreach = !sla.breachedResolution && sla.resolutionDue && sla.resolutionDue < now && !sla.resolvedAt;

      // Update SLA records
      await prisma.ticketSLA.update({
        where: { id: sla.id },
        data: {
          ...(isFirstResponseBreach && { breachedFirstResponse: true }),
          ...(isResolutionBreach && { breachedResolution: true }),
          escalatedAt: now
        }
      });

      // Internal Note regarding the breach
      const noteContent = `SLA Breached: ${isFirstResponseBreach ? 'First Response' : 'Resolution'} limit exceeded. Escalate immediately.`;

      const adminOptions = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true }
      });
      const adminId = adminOptions?.id || 1;

      await prisma.evolutionGroupNote.create({
        data: {
          ticketId: sla.ticketId,
          content: noteContent,
          isInternal: true,
          userId: adminId
        }
      });

      // Find users in the department to notify
      if (sla.ticket?.departmentId) {
        const notifyUsers = await prisma.user.findMany({
          where: { routingDepartmentId: sla.ticket.departmentId }
        });

        // Publish event for real-time notification
        void publishEvent('sla_events', {
          type: 'sla_breach',
          userId: String(notifyUsers[0]?.id || 1),
          conversationId: String(sla.ticketId),
          payload: {
            ticketId: sla.ticketId,
            departmentId: sla.ticket.departmentId,
            message: noteContent
          },
          userIds: notifyUsers.map(u => String(u.id))
        });
      }
    }

    return NextResponse.json({ success: true, escalatedCount: breachedTickets.length });
  } catch (error) {
    console.error('Error monitoring SLAs:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
