import { z } from 'zod'
import { fingerprintSchema } from './schemas/encodings'
import { publicIdentitySchema } from './schemas/identity'

export const postBanRequestBody = z.object({
  userId: publicIdentitySchema.shape.userId,
  nameFingerprint: fingerprintSchema,
})

export type PostBanRequestBody = z.infer<typeof postBanRequestBody>
