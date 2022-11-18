import { z } from 'zod'
import { signedHashSchema, timestampSchema } from './schemas/encodings'
import { publicIdentitySchema } from './schemas/identity'

export const publicRouteHeaders = z.object({
  'x-e2esdk-user-id': publicIdentitySchema.shape.userId,
  'x-e2esdk-timestamp': timestampSchema,
})

export const publicKeyAuthHeaders = publicRouteHeaders.extend({
  'x-e2esdk-signature': signedHashSchema,
})

// --

export type PublicRouteHeaders = z.infer<typeof publicRouteHeaders>
export type PublicKeyAuthHeaders = z.infer<typeof publicKeyAuthHeaders>
