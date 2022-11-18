import { z } from 'zod'
import {
  encryptedSharingPrivateKeySchema,
  encryptedSignaturePrivateKeySchema,
  thirtyTwoBytesBase64Schema,
} from './encodings'

export const publicIdentitySchema = z.object({
  userId: z.string().min(1),
  sharingPublicKey: thirtyTwoBytesBase64Schema,
  signaturePublicKey: thirtyTwoBytesBase64Schema,
})
export type PublicIdentity = z.infer<typeof publicIdentitySchema>

export const fullIdentitySchema = publicIdentitySchema.extend({
  sharingPrivateKey: encryptedSharingPrivateKeySchema,
  signaturePrivateKey: encryptedSignaturePrivateKeySchema,
})
