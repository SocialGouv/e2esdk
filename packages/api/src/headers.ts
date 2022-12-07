import { z } from 'zod'
import { signedHashSchema, timestampSchema } from './schemas/encodings'
import { identitySchema } from './schemas/identity'

export const publicKeyAuthHeaders = z.object({
  'x-e2esdk-user-id': identitySchema.shape.userId,
  'x-e2esdk-client-id': z.string().uuid(),
  'x-e2esdk-timestamp': timestampSchema,
  'x-e2esdk-signature': signedHashSchema,
})

export type PublicKeyAuthHeaders = z.infer<typeof publicKeyAuthHeaders>
