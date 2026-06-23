import { z } from 'zod'

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['WhatsApp', 'Email', 'SMS']),
  audience: z.number().default(0),
  template: z.string().optional(),
  scheduledDate: z.string().optional(),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
