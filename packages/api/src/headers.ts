import { z } from 'zod'
import { signatureSchema, timestampSchema } from './schemas/encodings'
import { identitySchema } from './schemas/identity'

export const publicKeyAuthHeaders = z.object({
  'x-e2esdk-user-id': identitySchema.shape.userId.describe('User ID'),
  'x-e2esdk-client-id': z.string().uuid().describe('Client ID'),
  'x-e2esdk-timestamp': timestampSchema.describe(
    'Current time of request/response'
  ),
  'x-e2esdk-signature': signatureSchema.describe('Authentication signature'),
})

export type PublicKeyAuthHeaders = z.infer<typeof publicKeyAuthHeaders>
