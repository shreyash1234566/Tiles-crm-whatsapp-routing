import { afterEach, describe, expect, it } from 'vitest'
import { extractEvolutionMessages, getEvolutionConfig, isGroupJid, normalizePhoneJid } from './evolution-routing'

afterEach(() => {
  delete process.env.EVOLUTION_API_URL
  delete process.env.EVOLUTION_API_KEY
  delete process.env.EVOLUTION_INSTANCE_NAME
  delete process.env.EVOLUTION_WEBHOOK_SECRET
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
})
