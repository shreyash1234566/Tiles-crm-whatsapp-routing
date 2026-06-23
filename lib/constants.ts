// ─── Lead Pipeline ────────────────────────────────────
export const PIPELINE_STAGES = ['New', 'Contacted', 'Showroom Visit', 'Quotation', 'Won', 'Lost'] as const

export const LEAD_SOURCES = ['WhatsApp', 'Instagram', 'Facebook', 'Website'] as const

// ─── Orders ──────────────────────────────────────────
export const ORDER_STATUSES = ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const

export const PAYMENT_STATUSES = ['Paid', 'Partial', 'Pending'] as const

export const ORDER_SOURCES = ['Store', 'Amazon', 'Flipkart', 'Shopify'] as const

// ─── Custom Orders ───────────────────────────────────
export const CUSTOM_ORDER_STATUSES = [
  'Measurement Scheduled',
  'Design Phase',
  'In Production',
  'Quality Check',
  'Installation',
  'Delivered',
] as const

// ─── Walk-ins ────────────────────────────────────────
export const WALKIN_STATUSES = ['Browsing', 'Interested', 'Follow-up', 'Converted', 'Left'] as const

// ─── Appointments ────────────────────────────────────
export const APPOINTMENT_STATUSES = ['Scheduled', 'Completed', 'Cancelled'] as const

// ─── Staff ───────────────────────────────────────────
export const STAFF_STATUSES = ['Active', 'Off Duty', 'On Leave'] as const

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half Day', 'Off Duty'] as const

// ─── Calls ───────────────────────────────────────────
export const CALL_DIRECTIONS = ['Inbound', 'Outbound'] as const

export const CALL_STATUSES = ['Completed', 'Missed', 'No Answer', 'Busy'] as const

// ─── Conversations ───────────────────────────────────
export const CONVERSATION_CHANNELS = ['WhatsApp', 'Instagram', 'Website'] as const

export const CONVERSATION_STATUSES = ['AI Handled', 'Needs Human', 'Resolved'] as const

// ─── Marketing ───────────────────────────────────────
export const CAMPAIGN_CHANNELS = ['WhatsApp', 'Email', 'SMS'] as const

export const CAMPAIGN_STATUSES = ['Draft', 'Scheduled', 'Sent'] as const

// ─── Billing ─────────────────────────────────────────
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque'] as const

export const DISCOUNT_TYPES = ['none', 'flat', 'percent'] as const

// ─── Product Categories ──────────────────────────────
export const PRODUCT_CATEGORIES = [
  'Sofas', 'Beds', 'Dining', 'Storage', 'Chairs',
  'Living Room', 'Bedroom', 'Kitchen',
] as const

// ─── User Roles ──────────────────────────────────────
export const USER_ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const

// ─── Reviews ─────────────────────────────────────────
export const REVIEW_PLATFORMS = ['Google', 'Facebook', 'Instagram', 'Website'] as const

// ─── Marketplace Channels ────────────────────────────
export const MARKETPLACE_CHANNELS = [
  { slug: 'amazon', name: 'Amazon', logo: '📦', color: '#FF9900' },
  { slug: 'flipkart', name: 'Flipkart', logo: '🛒', color: '#2874F0' },
  { slug: 'shopify', name: 'Shopify', logo: '🛍️', color: '#96BF48' },
] as const
