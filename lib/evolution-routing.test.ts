import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyIntent, extractEvolutionMessages, getEvolutionConfig, isGroupJid, normalizePhoneJid } from './evolution-routing'

afterEach(() => {
  delete process.env.EVOLUTION_API_URL
  delete process.env.EVOLUTION_API_KEY
  delete process.env.EVOLUTION_INSTANCE_NAME
  delete process.env.EVOLUTION_WEBHOOK_SECRET
  delete process.env.GROQ_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  vi.unstubAllGlobals()
})

describe('Evolution group routing adapter', () => {
  it('accepts group MESSAGES_UPSERT data and extracts text, sender, timestamp, and mentions', () => {
    const result = extractEvolutionMessages({
      event: 'MESSAGES_UPSERT',
      data: {
        key: {
          remoteJid: '120363123@g.us',
          id: 'ABC123',
          participant: '919999999999@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Second Participant',
        messageTimestamp: 1710000000,
        message: {
          extendedTextMessage: {
            text: 'Sales please call @919111111111',
            contextInfo: { mentionedJid: ['919111111111@s.whatsapp.net'] },
          },
        },
      },
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      groupJid: '120363123@g.us',
      messageId: 'ABC123',
      senderJid: '919999999999@s.whatsapp.net',
      senderName: 'Second Participant',
      text: 'Sales please call @919111111111',
      mentionedJids: ['919111111111@s.whatsapp.net'],
      fromMe: false,
    })
    expect(result[0]?.createdAt.getTime()).toBe(1710000000000)
  })

  it('ignores direct chats and rejects malformed group events', () => {
    expect(isGroupJid('120363123@g.us')).toBe(true)
    expect(isGroupJid('919999999999@s.whatsapp.net')).toBe(false)
    expect(extractEvolutionMessages({ event: 'MESSAGES_UPSERT', data: { key: { remoteJid: '919999999999@s.whatsapp.net', id: 'DIRECT' }, message: { conversation: 'hello' } } })).toEqual([])
  })

  it('requires all server-side Evolution secrets before declaring configuration available', () => {
    process.env.EVOLUTION_API_URL = 'https://evolution.example.test'
    process.env.EVOLUTION_API_KEY = 'key'
    process.env.EVOLUTION_INSTANCE_NAME = 'tiles'
    expect(getEvolutionConfig()).toBeNull()
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secret'
    expect(getEvolutionConfig()).toMatchObject({ instanceName: 'tiles' })
  })

  it('normalizes phone JIDs for direct mention matching', () => {
    expect(normalizePhoneJid('919999999999@s.whatsapp.net')).toBe('919999999999')
  })

  it('uses a confident Groq result without escalating', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"department":"sales","confidence":0.95,"reason":"rate inquiry"}' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(classifyIntent('What is the rate for this tile?')).resolves.toMatchObject({ department: 'sales', confidence: 0.95 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.groq.com')
  })

  it('escalates low-confidence Groq output to Claude', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key'
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"department":"unclear","confidence":0.3,"reason":"ambiguous"}' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: 'text', text: '{"department":"logistics","confidence":0.9,"reason":"delivery request"}' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(classifyIntent('Please check the delivery status.')).resolves.toMatchObject({ department: 'logistics', confidence: 0.9 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('api.anthropic.com')
  })

  it('returns unclear when no LLM credentials are configured', async () => {
    await expect(classifyIntent('A message with no deterministic keyword')).resolves.toMatchObject({ department: 'unclear', confidence: 0 })
  })
})
