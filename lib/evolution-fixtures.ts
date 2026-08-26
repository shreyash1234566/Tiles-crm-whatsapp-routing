/**
 * Tiles-only fixture factory for Evolution tests and local acceptance checks.
 * It intentionally contains no furniture products, customers, or fixtures.
 */
export function createTilesEvolutionFixture(overrides: {
  dealerName?: string
  groupJid?: string
  department?: string
  productCode?: string
} = {}) {
  const groupJid = overrides.groupJid || '120363000000001@g.us'
  return {
    dealer: {
      businessName: overrides.dealerName || 'Jaipur Marble & Tiles Dealer',
      contactPerson: 'Test Dealer',
      phone: '919999999999',
      whatsappNumber: '919999999999',
      dealerType: 'Distributor',
    },
    group: {
      groupJid,
      subject: 'Jaipur Marble Stock Enquiry',
      departmentName: overrides.department || 'Sales',
    },
    stock: {
      productCode: overrides.productCode || 'TGM-MARBLE-001',
      material: 'Italian Marble',
      lotNumber: 'LOT-JPR-001',
      finish: 'Polished',
    },
    inboundMessage: {
      key: { remoteJid: groupJid, id: 'fixture-message-1', participant: '919999999999@s.whatsapp.net', fromMe: false },
      pushName: 'Test Dealer',
      message: { conversation: `Please share rate and lot photos for ${overrides.productCode || 'TGM-MARBLE-001'}` },
    },
  }
}
