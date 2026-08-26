import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, endOfDay, subDays } from 'date-fns';

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

    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    // Calculate metrics for snapshot
    const activeTickets = await prisma.evolutionGroupTicket.count({
      where: { status: 'open' }
    });

    const dailyRevenue = await prisma.payment.aggregate({
      where: {
        date: { gte: start, lte: end }
      },
      _sum: { amount: true }
    });

    const newLeads = await prisma.lead.count({
      where: {
        createdAt: { gte: start, lte: end }
      }
    });

    const snapshot = await prisma.dashboardSnapshot.create({
      data: {
        snapshotType: 'DAILY_SUMMARY',
        periodStart: start,
        periodEnd: end,
        metrics: {
          activeTickets,
          revenue: dailyRevenue._sum?.amount || 0,
          newLeads
        }
      }
    });

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    console.error('Error creating dashboard snapshot:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
