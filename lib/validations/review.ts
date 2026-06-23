import { z } from 'zod'

export const createReviewSchema = z.object({
  customerName: z.string().min(1),
  rating: z.number().min(1).max(5),
  text: z.string().min(1),
  product: z.string().default('General'),
  platform: z.string().default('Google'),
})

export type CreateReviewInput = z.infer<typeof createReviewSchema>
