import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { getEvolutionOwnerUserId } from '@/lib/evolution-routing'

function canManage(role: string | undefined): boolean { return role === 'ADMIN' || role === 'MANAGER' }

function validPublishedGoogleSheetUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || '').trim())
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(host)) return null
    // A published CSV/export URL is read-only and needs no stored OAuth secret.
    const isSheetsExport = url.pathname.includes('/spreadsheets/d/') && (url.searchParams.get('format') === 'csv' || url.searchParams.get('output') === 'csv')
    const isDriveDownload = url.pathname === '/uc' && url.searchParams.get('export') === 'download'
    if (!isSheetsExport && !isDriveDownload) return null
    return url.toString()
  } catch { return null }
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can view catalog sources' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const sources = await prisma.evolutionCatalogSource.findMany({
    where: { userId: ownerId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { items: true, syncs: true } }, syncs: { orderBy: { startedAt: 'desc' }, take: 1, select: { id: true, status: true, startedAt: true, finishedAt: true, importedCount: true, unchangedCount: true, conflictCount: true, errorCount: true, errorSummary: true, errors: { orderBy: { createdAt: 'asc' }, take: 5, select: { rowNumber: true, code: true, message: true } } } } },
  })
  return NextResponse.json({ data: sources })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Only an admin or manager can configure catalog sources' }, { status: 403 })
  const ownerId = await getEvolutionOwnerUserId()
  if (!ownerId) return NextResponse.json({ error: 'No active Admin owner configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { sourceUrl?: unknown; sheetName?: unknown }
  const sourceUrl = validPublishedGoogleSheetUrl(body.sourceUrl)
  if (!sourceUrl) return NextResponse.json({ error: 'Use a published HTTPS Google Sheets CSV/export URL. Private URLs and non-Google hosts are blocked.' }, { status: 400 })
  const sheetName = String(body.sheetName || '').trim().slice(0, 200) || null
  const source = await prisma.evolutionCatalogSource.upsert({
    where: { userId_sourceUrl: { userId: ownerId, sourceUrl } },
    create: { userId: ownerId, sourceUrl, sheetName, sourceType: 'GOOGLE_SHEETS_CSV' },
    update: { sheetName, isActive: true },
  })
  return NextResponse.json({ data: source }, { status: 201 })
}
