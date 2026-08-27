import { prisma } from '@/lib/db'
import { catalogChecksum, parseCatalogCsv } from '@/lib/evolution-catalog'
import { recordEvolutionWorkerMetric } from '@/lib/evolution-worker-metrics'

const MAX_CATALOG_BYTES = 5 * 1024 * 1024
const MAX_CATALOG_ROWS = 2_000

export async function fetchPublishedCatalogCsv(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'text/csv,text/plain;q=0.9' } })
    if (!response.ok) throw new Error(`Google Sheet returned HTTP ${response.status}`)
    if (Number(response.headers.get('content-length') || 0) > MAX_CATALOG_BYTES) throw new Error('Catalog export exceeds the 5 MB limit')
    const value = await response.text()
    if (Buffer.byteLength(value, 'utf8') > MAX_CATALOG_BYTES) throw new Error('Catalog export exceeds the 5 MB limit')
    return value
  } finally { clearTimeout(timeout) }
}

export async function syncEvolutionCatalogSource(sourceId: string, options: { expectedOwnerId?: number; jobId?: string; trigger: 'MANUAL' | 'SCHEDULED' }) {
  const started = Date.now()
  const source = await prisma.evolutionCatalogSource.findFirst({ where: { id: sourceId, isActive: true, ...(options.expectedOwnerId ? { userId: options.expectedOwnerId } : {}) } })
  if (!source) throw new Error('Active catalog source not found')
  const sync = await prisma.evolutionCatalogSync.create({ data: { sourceId: source.id, status: 'RUNNING' } })
  try {
    const csv = await fetchPublishedCatalogCsv(source.sourceUrl)
    const parsed = parseCatalogCsv(csv)
    if (!parsed.rows.length) throw new Error('Catalog export contains no valid rows. Ensure SKU/code and product name columns are present.')
    if (parsed.rows.length > MAX_CATALOG_ROWS) throw new Error(`Catalog has ${parsed.rows.length} valid rows; the maximum per sync is ${MAX_CATALOG_ROWS}`)
    const sourceChecksum = catalogChecksum(csv)
    const products = await prisma.product.findMany({ select: { id: true, sku: true, price: true, stock: true }, where: { sku: { in: parsed.rows.map((row) => row.sku) } } })
    const byNormalizedSku = new Map(products.map((product) => [product.sku.toUpperCase().replace(/[\s_\-/.]+/g, ''), product]))
    let importedCount = 0; let unchangedCount = 0; let conflictCount = 0
    await prisma.$transaction(async (tx) => {
      for (const row of parsed.rows) {
        const existing = await tx.evolutionCatalogItem.findUnique({ where: { sourceId_externalRowId: { sourceId: source.id, externalRowId: row.externalRowId } }, select: { id: true, sourceChecksum: true, productId: true } })
        let product = byNormalizedSku.get(row.normalizedSku)
        if (!product && existing?.productId) {
          product = await tx.product.findUnique({ where: { id: existing.productId }, select: { id: true, sku: true, price: true, stock: true } }) || undefined
        }
        // Preserve an existing CRM link when a harmless SKU formatting
        // difference prevents this sync's lightweight exact-SKU lookup from
        // finding the product. A source sync must never detach CRM ownership.
        const linkedProductId = product?.id ?? existing?.productId ?? null

        // Reconcile protected CRM-field conflicts even when the published row
        // itself is unchanged. CRM price/stock can change between two source
        // syncs; skipping an unchanged row must not hide that difference.
        const reconcileConflicts = async (catalogItemId: string) => {
          await tx.evolutionCatalogConflict.deleteMany({ where: { catalogItemId, status: 'OPEN', field: { in: ['PRODUCT_PRICE_NOT_OVERWRITTEN', 'PRODUCT_STOCK_NOT_OVERWRITTEN'] } } })
          if (product && row.dealerRate != null && product.price !== row.dealerRate) {
            await tx.evolutionCatalogConflict.create({ data: { catalogItemId, field: 'PRODUCT_PRICE_NOT_OVERWRITTEN', sourceValue: row.dealerRate, crmValue: product.price } })
            conflictCount += 1
          }
          if (product && row.availableQuantity != null && product.stock !== row.availableQuantity) {
            await tx.evolutionCatalogConflict.create({ data: { catalogItemId, field: 'PRODUCT_STOCK_NOT_OVERWRITTEN', sourceValue: row.availableQuantity, crmValue: product.stock } })
            conflictCount += 1
          }
        }

        if (existing?.sourceChecksum === row.sourceChecksum) {
          await tx.evolutionCatalogItem.update({ where: { id: existing.id }, data: { productId: linkedProductId, lastSyncedAt: new Date() } })
          await reconcileConflicts(existing.id)
          unchangedCount += 1
          continue
        }
        const item = await tx.evolutionCatalogItem.upsert({
          where: { sourceId_externalRowId: { sourceId: source.id, externalRowId: row.externalRowId } },
          create: { ...row, sourceId: source.id, productId: linkedProductId },
          update: { ...row, productId: linkedProductId, lastSyncedAt: new Date() }, select: { id: true },
        })
        importedCount += 1
        await reconcileConflicts(item.id)
      }
      // A complete source snapshot is authoritative for this source. Rows
      // that disappeared from it must not remain dealer-visible indefinitely.
      // When parsing is partial, preserve old rows because an invalid source
      // row may simply be a malformed version of an existing item.
      if (parsed.errors.length === 0) {
        const externalRowIds = parsed.rows.map((row) => row.externalRowId)
        await tx.evolutionCatalogItem.updateMany({
          where: { sourceId: source.id, externalRowId: { notIn: externalRowIds }, active: true },
          data: { active: false, shareable: false, lastSyncedAt: new Date() },
        })
      }
      if (parsed.errors.length) await tx.evolutionCatalogSyncError.createMany({ data: parsed.errors.map((error) => ({ syncId: sync.id, rowNumber: error.rowNumber, code: error.code, message: error.message, rawRow: error.rawRow })) })
      const now = new Date(); const status = parsed.errors.length ? 'PARTIAL' : 'SUCCEEDED'
      await tx.evolutionCatalogSync.update({ where: { id: sync.id }, data: { status, finishedAt: now, sourceChecksum, importedCount, unchangedCount, conflictCount, errorCount: parsed.errors.length, errorSummary: parsed.errors.length ? `${parsed.errors.length} row(s) were skipped` : null } })
      await tx.evolutionCatalogSource.update({ where: { id: source.id }, data: { lastSyncAt: now, ...(status === 'SUCCEEDED' ? { lastSuccessAt: now } : {}), lastChecksum: sourceChecksum } })
    }, { timeout: 120_000 })
    const result = await prisma.evolutionCatalogSync.findUniqueOrThrow({ where: { id: sync.id }, include: { errors: { take: 50, orderBy: { createdAt: 'asc' } } } })
    await recordEvolutionWorkerMetric({ userId: source.userId, queue: 'evolution-catalog-sync', jobId: options.jobId, operation: options.trigger === 'SCHEDULED' ? 'scheduled_catalog_sync' : 'manual_catalog_sync', status: 'SUCCEEDED', durationMs: Date.now() - started, metadata: { sourceId, syncId: sync.id, importedCount, unchangedCount, errorCount: parsed.errors.length } })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : 'Catalog sync failed'
    await prisma.evolutionCatalogSync.update({ where: { id: sync.id }, data: { status: 'FAILED', finishedAt: new Date(), errorSummary: message } })
    await prisma.evolutionCatalogSource.update({ where: { id: source.id }, data: { lastSyncAt: new Date() } })
    await recordEvolutionWorkerMetric({ userId: source.userId, queue: 'evolution-catalog-sync', jobId: options.jobId, operation: options.trigger === 'SCHEDULED' ? 'scheduled_catalog_sync' : 'manual_catalog_sync', status: 'FAILED', durationMs: Date.now() - started, error: message, metadata: { sourceId, syncId: sync.id } })
    throw error
  }
}
