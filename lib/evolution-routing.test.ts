import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyIntent, extractEvolutionMessages, getEvolutionConfig, isGroupJid, normalizePhoneJid, sendEvolutionGroupMedia, sendEvolutionGroupText } from './evolution-routing'

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

  it('retains the metadata and original payload needed to retrieve image, document, and audio media', () => {
    const [image] = extractEvolutionMessages({
      event: 'MESSAGES_UPSERT',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'IMAGE-1', participant: '919999999999@s.whatsapp.net' },
        message: { imageMessage: { mimetype: 'image/jpeg', fileName: 'tile.jpg', url: 'https://encrypted.example/media' } },
      },
    })
    expect(image).toMatchObject({ mediaType: 'image', mediaMimeType: 'image/jpeg', mediaFileName: 'tile.jpg' })
    expect(image.rawMessage).toMatchObject({ key: { id: 'IMAGE-1' }, messageType: 'imageMessage' })

    const [audio] = extractEvolutionMessages({
      event: 'MESSAGES_UPSERT',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'AUDIO-1', participant: '919999999999@s.whatsapp.net' },
        message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
      },
    })
    expect(audio).toMatchObject({ mediaType: 'audio', mediaMimeType: 'audio/ogg; codecs=opus' })

    const [document] = extractEvolutionMessages({
      event: 'MESSAGES_UPSERT',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'DOC-1', participant: '919999999999@s.whatsapp.net' },
        message: { ephemeralMessage: { message: { documentMessage: { mimetype: 'application/pdf', fileName: 'invoice.pdf' } } } },
      },
    })
    expect(document).toMatchObject({ mediaType: 'document', mediaMimeType: 'application/pdf', mediaFileName: 'invoice.pdf' })
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

  it('uses the dedicated Evolution audio endpoint and media endpoint for other files', async () => {
    process.env.EVOLUTION_API_URL = 'http://evolution:8080'
    process.env.EVOLUTION_API_KEY = 'key'
    process.env.EVOLUTION_INSTANCE_NAME = 'tiles'
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secret'
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({ key: { id: 'sent' } }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendEvolutionGroupMedia({ groupJid: '120363123@g.us', mediaUrl: 'http://app:3000/api/uploads/a.ogg', mediaType: 'audio', mimeType: 'audio/ogg', fileName: 'voice.ogg' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/message/sendWhatsAppAudio/tiles')

    await sendEvolutionGroupMedia({ groupJid: '120363123@g.us', mediaUrl: 'http://app:3000/api/uploads/a.pdf', mediaType: 'document', mimeType: 'application/pdf', fileName: 'invoice.pdf' })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/message/sendMedia/tiles')
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('"fileName":"invoice.pdf"')
  })

  it('extracts a group reaction without treating it as a text inquiry', () => {
    const [reaction] = extractEvolutionMessages({
      event: 'MESSAGES_UPSERT',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'REACTION-EVENT-1', participant: '919999999999@s.whatsapp.net' },
        pushName: 'Dealer',
        message: { reactionMessage: { key: { id: 'ORIGINAL-MESSAGE-1' }, text: '👍' } },
      },
    })
    expect(reaction).toMatchObject({
      messageId: 'REACTION-EVENT-1',
      messageType: 'reactionMessage',
      text: null,
      reactionTargetMessageId: 'ORIGINAL-MESSAGE-1',
      reactionEmoji: '👍',
    })
  })

  it('normalizes Evolution dotted webhook event names for group reactions', () => {
    const [reaction] = extractEvolutionMessages({
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'REACTION-EVENT-2', participant: '919999999999@s.whatsapp.net' },
        message: { reactionMessage: { key: { id: 'ORIGINAL-MESSAGE-2' }, text: '✅' } },
      },
    })
    expect(reaction).toMatchObject({ reactionTargetMessageId: 'ORIGINAL-MESSAGE-2', reactionEmoji: '✅' })
  })

  it('accepts only reaction payloads from MESSAGES_UPDATE', () => {
    const [reaction] = extractEvolutionMessages({
      event: 'MESSAGES_UPDATE',
      data: {
        key: { remoteJid: '120363123@g.us', id: 'ORIGINAL-MESSAGE-3', participant: '919999999999@s.whatsapp.net' },
        update: { reactionMessage: { key: { id: 'ORIGINAL-MESSAGE-3' }, text: '❤️' } },
      },
    })
    expect(reaction).toMatchObject({ reactionTargetMessageId: 'ORIGINAL-MESSAGE-3', reactionEmoji: '❤️' })
    expect(reaction?.messageId).toContain('reaction:ORIGINAL-MESSAGE-3:')
  })

  it('does not treat status updates or outbound events as new inbound messages', () => {
    const data = { key: { remoteJid: '120363123@g.us', id: 'STATUS-1', participant: '919999999999@s.whatsapp.net' }, message: { conversation: 'hello' } }
    expect(extractEvolutionMessages({ event: 'MESSAGES_UPDATE', data })).toEqual([])
    expect(extractEvolutionMessages({ event: 'SEND_MESSAGE', data })).toEqual([])
  })

  it('sends text in the top-level field required by Evolution v2.3.7', async () => {
    process.env.EVOLUTION_API_URL = 'http://evolution:8080'
    process.env.EVOLUTION_API_KEY = 'key'
    process.env.EVOLUTION_INSTANCE_NAME = 'tiles'
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secret'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: { id: 'sent' } }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendEvolutionGroupText({ groupJid: '120363123@g.us', text: 'hi' })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ number: '120363123@g.us', text: 'hi' })
    expect(body.textMessage).toBeUndefined()
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
