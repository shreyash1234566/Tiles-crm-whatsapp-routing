import { describe, expect, it } from 'vitest'
import { buildDealerSafeCatalogDraft, catalogCodeCandidates, extractCatalogCodeCandidates, normalizeCatalogCode, parseCatalogCsv } from './evolution-catalog'

describe('Evolution catalog automation safeguards', () => {
  it('normalizes SKU formatting without silently replacing valid letters', () => {
    expect(normalizeCatalogCode(' tgm-marble 001 ')).toBe('TGMMARBLE001')
    expect(catalogCodeCandidates('TGM-O1')).toContain('TGMO1')
  })

  it('extracts code candidates from Hindi/Hinglish dealer messages', () => {
    expect(extractCatalogCodeCandidates('Bhai TGM-MARBLE-001 ka rate bhejo')).toContain('TGMMARBLE001')
  })

  it('imports a published Sheet CSV with only valid dealer-shareable URLs', () => {
    const input = 'SKU,Product Name,Dealer Rate,Available Quantity,Shareable With Dealer,Photo URLs\nTGM-001,Italian Marble,250,100,yes,"https://example.com/a.jpg|http://unsafe.example/b.jpg"'
    const { rows, errors } = parseCatalogCsv(input)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ normalizedSku: 'TGM001', dealerRate: 250, availableQuantity: 100, shareable: true })
    expect(rows[0].photoUrls).toEqual(['https://example.com/a.jpg'])
  })

  it('rejects catalog rows missing SKU or product name', () => {
    const { rows, errors } = parseCatalogCsv('SKU,Product Name\n,Missing code\nTGM-2,')
    expect(rows).toEqual([])
    expect(errors).toHaveLength(2)
  })

  it('rejects duplicate external row ids rather than silently replacing a catalog row', () => {
    const { rows, errors } = parseCatalogCsv('Row ID,SKU,Product Name\nrow-1,TGM-1,First\nrow-1,TGM-2,Second')
    expect(rows).toHaveLength(1)
    expect(errors).toMatchObject([{ code: 'DUPLICATE_SOURCE_ROW' }])
  })

  it('never writes cost, margin, supplier, or a reservation claim into dealer drafts', () => {
    const draft = buildDealerSafeCatalogDraft([{ sku: 'TGM-001', name: 'Italian Marble', materialCategory: 'MARBLE', tileSize: null, unitOfMeasure: 'SQFT', finish: 'POLISHED', applicationArea: null, dealerPriceTier: 'A', dealerRate: 250, minimumQuantity: 20, availableQuantity: 100, stockStatus: 'AVAILABLE', lotNumber: 'LOT-1', shadeCode: 'A', photoUrls: [], videoUrls: [] }])
    expect(draft).toContain('Warehouse allocation confirmation')
    expect(draft).not.toMatch(/cost|margin|supplier|reserved/i)
  })
})
