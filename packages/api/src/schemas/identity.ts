import { z } from 'zod'
import { signedHashSchema, thirtyTwoBytesBase64Schema } from './encodings'

export const identitySchema = z.object({
  userId: z.string().min(1).max(128),
  sharingPublicKey: thirtyTwoBytesBase64Schema,
  signaturePublicKey: thirtyTwoBytesBase64Schema,
  proof: signedHashSchema,
})
export type Identity = z.infer<typeof identitySchema>
