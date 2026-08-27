import { describe, expect, it } from 'vitest'
import { evolutionSafetyBlockReason, isEvolutionMarketingOptOut } from './evolution-safety'

describe('Evolution WhatsApp safety', () => {
  it.each([
    'STOP',
    'unsubscribe',
    'opt out',
    'band karo',
    'मैसेज बंद करो',
    'Stop!',
  ])('recognizes an explicit campaign opt-out: %s', (message) => {
    expect(isEvolutionMarketingOptOut(message)).toBe(true)
  })

  it.each([
    'stop payment for this invoice',
    'do not stop the dispatch',
    'please cancel this quotation',
    'promotion ka rate bhejo',
    '',
  ])('does not disable campaigns for ordinary business text: %s', (message) => {
    expect(isEvolutionMarketingOptOut(message)).toBe(false)
  })

  it('pauses automation without preventing a manual team reply', () => {
    const config = { allOutboundPaused: false, automationPaused: true, pauseReason: 'Manager review', circuitOpenUntil: null, circuitReason: null }
    expect(evolutionSafetyBlockReason(config, 'RAG')).toContain('automation is paused')
    expect(evolutionSafetyBlockReason(config, 'CAMPAIGN')).toContain('automation is paused')
    expect(evolutionSafetyBlockReason(config, 'MANUAL')).toBeNull()
  })

  it('emergency stop prevents every outbound category', () => {
    const config = { allOutboundPaused: true, automationPaused: true, pauseReason: 'Emergency stop', circuitOpenUntil: null, circuitReason: null }
    expect(evolutionSafetyBlockReason(config, 'MANUAL')).toContain('All WhatsApp sending is paused')
    expect(evolutionSafetyBlockReason(config, 'FOLLOW_UP')).toContain('All WhatsApp sending is paused')
  })

  it('connection circuit blocks manual sends but a provider-failure circuit only blocks automation', () => {
    const future = new Date(Date.now() + 60_000)
    const connection = { allOutboundPaused: false, automationPaused: false, pauseReason: null, circuitOpenUntil: future, circuitReason: 'Connection state: disconnected' }
    const provider = { ...connection, circuitReason: '3 consecutive provider failures' }
    expect(evolutionSafetyBlockReason(connection, 'MANUAL')).toContain('circuit is open')
    expect(evolutionSafetyBlockReason(provider, 'MANUAL')).toBeNull()
    expect(evolutionSafetyBlockReason(provider, 'CATALOG')).toContain('circuit is open')
  })
})
