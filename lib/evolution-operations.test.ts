import { describe, expect, it } from 'vitest'
import {
  agentAllowsGroup,
  evolutionPhoneCandidates,
  isClosedInquiryStage,
  isEvolutionInquiryStage,
  isValidEvolutionStageTransition,
  hasSafeLiveEvolutionRollout,
  normalizeEvolutionPhone,
} from './evolution-operations'

describe('Evolution dealer operations guards', () => {
  it('normalizes WhatsApp phones and supports the common Indian local representation', () => {
    expect(normalizeEvolutionPhone(' +91 99999-99999@s.whatsapp.net ')).toBe('919999999999')
    expect(evolutionPhoneCandidates('919999999999@s.whatsapp.net')).toEqual(expect.arrayContaining(['919999999999', '9999999999', '+919999999999']))
  })

  it('requires both group and department allowlists when either is configured', () => {
    const config = { allowedGroupJids: ['120363123@g.us'], allowedDepartmentIds: [7] }
    expect(agentAllowsGroup(config, '120363123@g.us', 7)).toBe(true)
    expect(agentAllowsGroup(config, '120363123@g.us', 4)).toBe(false)
    expect(agentAllowsGroup(config, '120300000@g.us', 7)).toBe(false)
    expect(agentAllowsGroup({ allowedGroupJids: [], allowedDepartmentIds: [] }, '120300000@g.us', null)).toBe(true)
  })

  it('enforces the dealer inquiry lifecycle and closed-stage guard', () => {
    expect(isEvolutionInquiryStage('quotation')).toBe(true)
    expect(isValidEvolutionStageTransition('NEW', 'TRIAGED')).toBe(true)
    expect(isValidEvolutionStageTransition('NEW', 'DISPATCHED')).toBe(false)
    expect(isValidEvolutionStageTransition('DELIVERED', 'CLOSED')).toBe(true)
    expect(isClosedInquiryStage('LOST')).toBe(true)
    expect(isClosedInquiryStage('WORKING')).toBe(false)
  })

  it('permits automatic replies only for one named test group', () => {
    expect(hasSafeLiveEvolutionRollout(false, false, [])).toBe(true)
    expect(hasSafeLiveEvolutionRollout(true, true, [])).toBe(true)
    expect(hasSafeLiveEvolutionRollout(true, false, ['120363123@g.us'])).toBe(true)
    expect(hasSafeLiveEvolutionRollout(true, false, [])).toBe(false)
    expect(hasSafeLiveEvolutionRollout(true, false, ['a@g.us', 'b@g.us'])).toBe(false)
  })
})
