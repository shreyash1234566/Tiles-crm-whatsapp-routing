/**
 * lib/whatsapp/inquiry-message.ts
 *
 * Sends the automated 3-button inquiry welcome message to a new WhatsApp contact.
 *
 * Triggered when:
 *   - A new contact sends their FIRST WhatsApp message
 *
 * The message uses WhatsApp interactive buttons (works within 24-hour window).
 * The customer's own first message opens the window, so this reply is always valid.
 *
 * Buttons:
 *   1. 📦 Product Details   → id: "INFO_PRODUCTS"
 *   2. 📍 Company Address   → id: "INFO_ADDRESS"
 *   3. 📅 Schedule Visit    → id: "SCHEDULE_APPOINTMENT"
 */

import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendInteractiveButtonMessage, sendTextMessage } from '@/lib/whatsapp/meta-api'
import { getBrand } from '@/lib/brand'

/**
 * Resolve the customer-facing brand strings for the Active_Vertical from
 * Brand_Config (lib/brand.ts).
 *
 * The furniture vertical keeps its existing customer-facing company name
 * ("Kosmic Furniture") and message copy byte-for-byte (Requirement 10.3 /
 * 13.1). The support contacts (phone, email, website, address) are sourced
 * from Brand_Config, whose furniture values already mirror the previously
 * hardcoded literals. The tiles vertical uses the Homzentic brand name
 * (Requirement 10.1, 10.4).
 */
function getWaBrand() {
  const brand = getBrand()
  const isTiles = brand.vertical === 'tiles'
  return {
    isTiles,
    companyName: isTiles ? brand.name : 'Kosmic Furniture',
    phone: brand.support.phone,
    phoneLine: brand.support.altPhone
      ? `${brand.support.phone} | ${brand.support.altPhone}`
      : brand.support.phone,
    email: brand.support.email,
    website: brand.support.website,
    address: brand.support.address,
  }
}

interface InquirySendOptions {
  userId: string
  contactPhone: string
  contactName: string
  conversationId: string
  /** Meta message ID of the incoming message — used for DB logging */
  incomingMessageId: string
}

/**
 * Send the 3-button inquiry welcome message via WhatsApp.
 * Silently swallows errors — a failed welcome must never break the main flow.
 */
export async function sendInquiryWelcomeMessage(opts: InquirySendOptions): Promise<void> {
  const { userId, contactPhone, contactName, conversationId, incomingMessageId } = opts

  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({
      where: { user_id: userId },
    })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const phoneNumberId = waConfig.phone_number_id

    const firstName = contactName?.split(' ')[0] || 'Aap'

    const wa = getWaBrand()
    const specialtiesLine = wa.isTiles
      ? 'Hum tiles & sanitaryware ke specialist hain — floor tiles, wall tiles, bathroom fittings aur sanitaryware.'
      : 'Hum institutional furniture ke specialist hain — office, school, hospital aur custom furniture.'
    const productsDesc = wa.isTiles ? 'tiles & sanitaryware' : 'furniture'
    const headerEmoji = wa.isTiles ? '🧱' : '🪑'

    const bodyText =
      `Namaste *${firstName}* ji! 🙏\n\n` +
      `${wa.companyName} mein aapka swagat hai! ${specialtiesLine}\n\n` +
      `Aap kya jaanna chahenge?`

    let metaMessageId: string | undefined

    try {
      // Try sending interactive buttons (works in 24h window — customer just messaged us)
      const result = await sendInteractiveButtonMessage({
        phoneNumberId,
        accessToken,
        to: contactPhone,
        headerText: `${headerEmoji} ${wa.companyName}`,
        bodyText,
        footerText: `Mon–Sat | 10 AM – 6 PM | ${wa.address}`,
        buttons: [
          { id: 'INFO_PRODUCTS', title: '📦 Product Details' },
          { id: 'INFO_ADDRESS', title: '📍 Company Address' },
          { id: 'SCHEDULE_APPOINTMENT', title: '📅 Schedule Visit' },
        ],
      })
      metaMessageId = result.messageId
    } catch (interactiveErr) {
      console.warn('[inquiry-message] Interactive message failed, falling back to text:', interactiveErr)
      // Fallback to plain text if interactive fails
      const fallbackText =
        `Namaste *${firstName}* ji! 🙏 ${wa.companyName} mein aapka swagat hai!\n\n` +
        `Aap yeh likh ke jaankari le sakte hain:\n` +
        `• *products* — hamare ${productsDesc} ke baare mein\n` +
        `• *address* — showroom ka pata\n` +
        `• *appointment* — showroom visit schedule karna`
      const result = await sendTextMessage({
        phoneNumberId,
        accessToken,
        to: contactPhone,
        text: fallbackText,
      })
      metaMessageId = result.messageId
    }

    if (!metaMessageId) return

    // Save welcome message to DB
    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: bodyText,
        message_id: metaMessageId,
        status: 'sent',
      },
    })

    await prisma.waConversation.update({
      where: { id: conversationId },
      data: {
        last_message_text: bodyText,
        last_message_at: new Date(),
      },
    })

    console.log(`[inquiry-message] Welcome message sent to ${contactPhone} (conv: ${conversationId})`)
  } catch (err) {
    // Non-critical — log and move on
    console.error('[inquiry-message] Failed to send welcome message:', err)
  }
}

/**
 * Handle "INFO_PRODUCTS" button click — send product details text.
 */
export async function sendProductInfoMessage(
  userId: string,
  contactPhone: string,
  conversationId: string,
): Promise<void> {
  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({ where: { user_id: userId } })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const wa = getWaBrand()
    const text = wa.isTiles
      ? `🧱 *${wa.companyName} — Catalog*\n\n` +
      `Hum in products ke specialist hain:\n\n` +
      `🏠 *Floor & Wall Tiles*\n` +
      `  • Vitrified, ceramic aur designer tiles\n\n` +
      `🚿 *Bathroom Fittings*\n` +
      `  • Faucets, showers, accessories\n\n` +
      `🪣 *Sanitaryware*\n` +
      `  • Wash basins, water closets, kitchen sinks\n\n` +
      `🧰 *Adhesives & Grouts*\n` +
      `  • Tile adhesives, grouts, sealants\n\n` +
      `Quote ya details ke liye humse baat karein:\n📞 ${wa.phone}`
      : `🪑 *${wa.companyName} — Products*\n\n` +
      `Hum in products ke specialist hain:\n\n` +
      `🏢 *Office Furniture*\n` +
      `  • Office chairs, workstations, conference tables\n\n` +
      `🏫 *School Furniture*\n` +
      `  • Desks, benches, lab furniture\n\n` +
      `🏥 *Hospital Furniture*\n` +
      `  • Beds, trolleys, waiting chairs\n\n` +
      `🏗️ *Custom Institutional*\n` +
      `  • Bulk orders, custom design, pan-India delivery\n\n` +
      `Quote ya details ke liye humse baat karein:\n📞 ${wa.phone}`

    const result = await sendTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken,
      to: contactPhone,
      text,
    })

    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: { last_message_text: text, last_message_at: new Date() },
    })
  } catch (err) {
    console.error('[inquiry-message] sendProductInfoMessage failed:', err)
  }
}

/**
 * Handle "INFO_ADDRESS" button click — send address/location info.
 */
export async function sendAddressMessage(
  userId: string,
  contactPhone: string,
  conversationId: string,
): Promise<void> {
  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({ where: { user_id: userId } })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const wa = getWaBrand()
    const text =
      `📍 *${wa.companyName} — Showroom Address*\n\n` +
      `${wa.companyName}\n` +
      `${wa.address}\n\n` +
      `📞 *Phone:* ${wa.phoneLine}\n` +
      `📧 *Email:* ${wa.email}\n` +
      `🌐 *Website:* ${wa.website}\n\n` +
      `⏰ *Timings:* Monday – Saturday | 10 AM – 6 PM\n\n` +
      `Showroom visit schedule karne ke liye *appointment* likhein!`

    const result = await sendTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken,
      to: contactPhone,
      text,
    })

    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: { last_message_text: text, last_message_at: new Date() },
    })
  } catch (err) {
    console.error('[inquiry-message] sendAddressMessage failed:', err)
  }
}
