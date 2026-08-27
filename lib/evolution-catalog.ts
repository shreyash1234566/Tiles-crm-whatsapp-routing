import { createHash } from 'node:crypto'

export type CatalogImportRow = {
  externalRowId: string
  sku: string
  normalizedSku: string
  name: string
  category: string | null
  materialCategory: string | null
  tileSize: string | null
  unitOfMeasure: string | null
  finish: string | null
  applicationArea: string | null
  hsnCode: string | null
  dealerPriceTier: string | null
  dealerRate: number | null
  minimumQuantity: number | null
  availableQuantity: number | null
  stockStatus: string | null
  lotNumber: string | null
  shadeCode: string | null
  photoUrls: string[]
  videoUrls: string[]
  shareable: boolean
  active: boolean
  sourceChecksum: string
  sourceData: Record<string, string>
}

type CsvRecord = Record<string, string>

const FIELD_ALIASES: Record<string, string[]> = {
  externalRowId: ['externalrowid', 'rowid', 'id', 'sourceid'],
  sku: ['sku', 'code', 'productcode', 'productsku', 'itemcode'],
  name: ['name', 'productname', 'itemname', 'product'],
  category: ['category', 'productcategory'],
  materialCategory: ['materialcategory', 'material', 'stonecategory'],
  tileSize: ['tilesize', 'size', 'dimensions'],
  unitOfMeasure: ['unitofmeasure', 'unit', 'uom'],
  finish: ['finish', 'surfacefinish'],
  applicationArea: ['applicationarea', 'application', 'use'],
  hsnCode: ['hsncode', 'hsn'],
  dealerPriceTier: ['dealerpricetier', 'pricetier', 'tier'],
  dealerRate: ['dealerrate', 'dealerprice', 'rate', 'price'],
  minimumQuantity: ['minimumquantity', 'minquantity', 'moq'],
  availableQuantity: ['availablequantity', 'availablestock', 'stock', 'quantity'],
  stockStatus: ['stockstatus', 'availability', 'status'],
  lotNumber: ['lotnumber', 'lot', 'batchnumber'],
  shadeCode: ['shadecode', 'shade'],
  photoUrls: ['photourls', 'photos', 'photourl', 'imageurls', 'imageurl'],
  videoUrls: ['videourls', 'videos', 'videourl'],
  shareable: ['shareablewithdealer', 'shareable', 'dealerapproved'],
  active: ['active', 'isactive'],
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max)
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function valueFor(row: CsvRecord, field: keyof typeof FIELD_ALIASES): string {
  const aliases = FIELD_ALIASES[field]
  for (const alias of aliases) {
    const matchingKey = Object.keys(row).find((header) => key(header) === alias)
    if (matchingKey && clean(row[matchingKey])) return clean(row[matchingKey])
  }
  return ''
}

function numberOrNull(value: string): number | null {
  const normalized = value.replace(/[₹,₹\s]/g, '')
  if (!normalized) return null
  const result = Number(normalized)
  return Number.isFinite(result) && result >= 0 ? result : null
}

function booleanOrDefault(value: string, fallback: boolean): boolean {
  if (!value) return fallback
  return ['true', 'yes', 'y', '1', 'approved', 'active'].includes(value.trim().toLowerCase())
}

function urls(value: string): string[] {
  return value.split(/[|,\n]/).map((item) => item.trim()).filter((item) => /^https:\/\//i.test(item)).slice(0, 12)
}

/** Exact SKU normalization is deliberately conservative; ambiguous OCR swaps
 * are generated as lookup candidates rather than silently changing a code. */
export function normalizeCatalogCode(value: unknown): string {
  return clean(value, 120).toUpperCase().replace(/[\s_\-/.]+/g, '')
}

export function catalogCodeCandidates(value: unknown): string[] {
  const normalized = normalizeCatalogCode(value)
  if (!normalized) return []
  const candidates = new Set([normalized])
  // OCR confusion is considered only after exact matching and only for codes
  // containing a digit. This avoids changing valid product names such as ONYX.
  if (/\d/.test(normalized)) {
    candidates.add(normalized.replace(/O/g, '0'))
    candidates.add(normalized.replace(/0/g, 'O'))
    candidates.add(normalized.replace(/I/g, '1'))
    candidates.add(normalized.replace(/1/g, 'I'))
  }
  return [...candidates].filter((candidate) => candidate.length >= 3)
}

export function extractCatalogCodeCandidates(message: unknown): string[] {
  const text = clean(message, 2_000).toUpperCase()
  // Keep the token bounded: permitting arbitrary spaces here made a whole
  // Hinglish sentence look like one SKU. Human lookup still supports names.
  const tokens = text.match(/[A-Z0-9][A-Z0-9_\-/.]*\d[A-Z0-9_\-/.]*/g) || []
  return [...new Set(tokens.filter((token) => /\d/.test(token)).flatMap(catalogCodeCandidates))].slice(0, 12)
}

export function catalogChecksum(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

/** Parses RFC-4180 style CSV sufficiently for a published Google Sheet export. */
export function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = []
  let row: string[] = []; let cell = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift()?.map((header) => clean(header.replace(/^\uFEFF/, ''), 100)) || []
  return rows.filter((values) => values.some((value) => clean(value))).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index] || '', 5_000)])))
}

export function parseCatalogCsv(text: string): { rows: CatalogImportRow[]; errors: Array<{ rowNumber: number; code: string; message: string; rawRow: CsvRecord }> } {
  const records = parseCsv(text)
  const rows: CatalogImportRow[] = []; const errors: Array<{ rowNumber: number; code: string; message: string; rawRow: CsvRecord }> = []
  const externalRowIds = new Set<string>()
  records.forEach((record, index) => {
    const sku = valueFor(record, 'sku'); const name = valueFor(record, 'name')
    if (!sku || !name) { errors.push({ rowNumber: index + 2, code: 'MISSING_REQUIRED_FIELD', message: 'SKU/code and product name are required', rawRow: record }); return }
    const normalizedSku = normalizeCatalogCode(sku)
    if (normalizedSku.length < 3) { errors.push({ rowNumber: index + 2, code: 'INVALID_SKU', message: 'SKU/code must contain at least 3 normalized characters', rawRow: record }); return }
    const sourceData = Object.fromEntries(Object.entries(record).map(([header, value]) => [clean(header, 100), clean(value, 5_000)]))
    const externalRowId = valueFor(record, 'externalRowId') || `${normalizedSku}:${valueFor(record, 'lotNumber') || index + 2}`
    if (externalRowIds.has(externalRowId)) {
      errors.push({ rowNumber: index + 2, code: 'DUPLICATE_SOURCE_ROW', message: `Duplicate external row id: ${externalRowId}`, rawRow: record })
      return
    }
    externalRowIds.add(externalRowId)
    rows.push({
      externalRowId, sku, normalizedSku, name,
      category: valueFor(record, 'category') || null, materialCategory: valueFor(record, 'materialCategory') || null,
      tileSize: valueFor(record, 'tileSize') || null, unitOfMeasure: valueFor(record, 'unitOfMeasure') || null,
      finish: valueFor(record, 'finish') || null, applicationArea: valueFor(record, 'applicationArea') || null,
      hsnCode: valueFor(record, 'hsnCode') || null, dealerPriceTier: valueFor(record, 'dealerPriceTier') || null,
      dealerRate: numberOrNull(valueFor(record, 'dealerRate')), minimumQuantity: numberOrNull(valueFor(record, 'minimumQuantity')),
      availableQuantity: numberOrNull(valueFor(record, 'availableQuantity')), stockStatus: valueFor(record, 'stockStatus') || null,
      lotNumber: valueFor(record, 'lotNumber') || null, shadeCode: valueFor(record, 'shadeCode') || null,
      photoUrls: urls(valueFor(record, 'photoUrls')), videoUrls: urls(valueFor(record, 'videoUrls')),
      shareable: booleanOrDefault(valueFor(record, 'shareable'), false), active: booleanOrDefault(valueFor(record, 'active'), true),
      sourceChecksum: catalogChecksum(sourceData), sourceData,
    })
  })
  return { rows, errors }
}

export type DealerSafeCatalogItem = Pick<CatalogImportRow, 'sku' | 'name' | 'materialCategory' | 'tileSize' | 'unitOfMeasure' | 'finish' | 'applicationArea' | 'dealerPriceTier' | 'dealerRate' | 'minimumQuantity' | 'availableQuantity' | 'stockStatus' | 'lotNumber' | 'shadeCode' | 'photoUrls' | 'videoUrls'>

export function buildDealerSafeCatalogDraft(items: DealerSafeCatalogItem[], note?: string): string {
  const selected = items.slice(0, 3)
  if (!selected.length) return 'We could not confirm a dealer-shareable product match. Please share the product code or a clearer reference photo and our team will assist.'
  const lines = selected.map((item, index) => {
    const facts = [
      `Code: ${item.sku}`,
      item.materialCategory && `Material: ${item.materialCategory}`,
      item.tileSize && `Size: ${item.tileSize}`,
      item.finish && `Finish: ${item.finish}`,
      item.unitOfMeasure && `Unit: ${item.unitOfMeasure}`,
      item.lotNumber && `Lot: ${item.lotNumber}`,
      item.shadeCode && `Shade: ${item.shadeCode}`,
      item.availableQuantity != null && `Available: ${item.availableQuantity}${item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ''}`,
      item.dealerRate != null && `Dealer rate: ₹${item.dealerRate}${item.unitOfMeasure ? `/${item.unitOfMeasure}` : ''}`,
      item.minimumQuantity != null && `MOQ: ${item.minimumQuantity}`,
    ].filter(Boolean).join(' · ')
    return `${index + 1}. ${item.name}\n${facts}`
  })
  return `${note?.trim() ? `${note.trim()}\n\n` : ''}Available dealer-shareable options:\n\n${lines.join('\n\n')}\n\nStock is subject to Warehouse allocation confirmation.`
}
