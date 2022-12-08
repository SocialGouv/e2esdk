import { z } from 'zod'
import { signatureSchema, thirtyTwoBytesBase64Schema } from './encodings'

export const identitySchema = z
  .object({
    userId: z.string().min(1).max(128),
    sharingPublicKey: thirtyTwoBytesBase64Schema,
    signaturePublicKey: thirtyTwoBytesBase64Schema,
    proof: signatureSchema,
  })
  .describe('Cryptographic user identity')

export type Identity = z.infer<typeof identitySchema>
