import { z } from 'zod'
import { fingerprintSchema } from './schemas/encodings'
import { identitySchema } from './schemas/identity'

export const postBanRequestBody = z.object({
  userId: identitySchema.shape.userId,
  keychainFingerprint: fingerprintSchema,
})

export type PostBanRequestBody = z.infer<typeof postBanRequestBody>
