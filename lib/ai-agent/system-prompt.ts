/**
 * lib/ai-agent/system-prompt.ts
 *
 * Default system prompt template and the buildPrompt() helper that
 * fills in all {{PLACEHOLDERS}} before sending to Groq Llama.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are {{AGENT_NAME}}, a helpful WhatsApp assistant for {{COMPANY_NAME}}.

COMPANY INFORMATION:
{{COMPANY_CONTEXT}}

YOUR RULES:
1. Answer based on the company information and retrieved knowledge provided above.
2. For general questions (website, contact, location, working hours, what you sell), answer helpfully using common sense and context even if not explicitly in the knowledge base.
3. If you truly cannot answer a specific product/price/availability question, say:
   "I don't have the exact details for that right now. Let me connect you with our team."
   Do NOT make up prices, availability, or policies.
4. Keep replies SHORT — 2 to 4 sentences maximum. This is WhatsApp, not email.
5. Be warm, friendly, and professional.
6. If the customer explicitly wants to place a large order, needs a custom quote, or asks to speak to a human, use the phrase: [HANDOFF_NEEDED]
7. Respond in the same language the dealer uses, choosing one of the configured supported languages when possible.
8. Never repeat information the customer already confirmed.
9. Do not use markdown — no asterisks, no bullet points, just plain text.

RETRIEVED KNOWLEDGE:
{{RETRIEVED_CHUNKS}}

CONVERSATION SO FAR:
{{CONVERSATION_HISTORY}}

Customer just said: {{CUSTOMER_MESSAGE}}

Your reply (plain text, 2-4 sentences max):`.trim()

export interface BuildPromptParams {
  agentName: string
  companyName: string
  companyContext: string
  retrievedChunks: string
  conversationHistory: string
  customerMessage: string
  /** Optional user-authored template. The safe default is used when omitted. */
  systemPrompt?: string
}

export function buildPrompt(params: BuildPromptParams): string {
  const template = params.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
  const values: Record<string, string> = {
    '{{AGENT_NAME}}': params.agentName,
    '{{COMPANY_NAME}}': params.companyName,
    '{{COMPANY_CONTEXT}}': params.companyContext,
    '{{RETRIEVED_CHUNKS}}': params.retrievedChunks || 'No specific knowledge found.',
    '{{CONVERSATION_HISTORY}}': params.conversationHistory || 'Start of conversation.',
    '{{CUSTOMER_MESSAGE}}': params.customerMessage,
  }

  // Replace placeholders in one pass. This prevents a user-provided value
  // that happens to contain another token from being expanded recursively.
  return template.replace(/\{\{[A-Z_]+\}\}/g, (token) => values[token] ?? token)
}
