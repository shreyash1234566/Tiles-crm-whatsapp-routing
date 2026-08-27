import { describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, buildPrompt } from './system-prompt'

describe('Evolution RAG system prompt builder', () => {
  const context = {
    agentName: 'Maya',
    companyName: 'Tiles CRM',
    companyContext: 'B2B dealer support only',
    retrievedChunks: 'SKU T-100 is available in polished finish.',
    conversationHistory: 'Dealer: Do you have T-100?',
    customerMessage: 'What is the rate?',
  }

  it('uses the safe default template when no custom prompt is supplied', () => {
    const prompt = buildPrompt(context)
    expect(prompt).toContain('Maya')
    expect(prompt).toContain('SKU T-100 is available in polished finish.')
    expect(prompt).toContain('What is the rate?')
    expect(prompt).not.toContain('{{CUSTOMER_MESSAGE}}')
  })

  it('applies a custom template and replaces repeated placeholders', () => {
    const prompt = buildPrompt({
      ...context,
      systemPrompt: '{{AGENT_NAME}} | {{CUSTOMER_MESSAGE}} | {{CUSTOMER_MESSAGE}} | {{RETRIEVED_CHUNKS}}',
    })
    expect(prompt).toBe('Maya | What is the rate? | What is the rate? | SKU T-100 is available in polished finish.')
  })

  it('does not recursively expand placeholders inside user-provided values', () => {
    const prompt = buildPrompt({
      ...context,
      agentName: '{{CUSTOMER_MESSAGE}}',
      systemPrompt: 'Agent={{AGENT_NAME}}; customer={{CUSTOMER_MESSAGE}}',
    })
    expect(prompt).toBe('Agent={{CUSTOMER_MESSAGE}}; customer=What is the rate?')
  })

  it('retains the default template when a custom prompt is blank', () => {
    expect(buildPrompt({ ...context, systemPrompt: '   ' })).toBe(
      DEFAULT_SYSTEM_PROMPT
        .replaceAll('{{AGENT_NAME}}', context.agentName)
        .replaceAll('{{COMPANY_NAME}}', context.companyName)
        .replaceAll('{{COMPANY_CONTEXT}}', context.companyContext)
        .replaceAll('{{RETRIEVED_CHUNKS}}', context.retrievedChunks)
        .replaceAll('{{CONVERSATION_HISTORY}}', context.conversationHistory)
        .replaceAll('{{CUSTOMER_MESSAGE}}', context.customerMessage),
    )
  })
})
