import { z } from 'zod'
import {
  fingerprintSchema,
  PayloadType,
  secretBoxCiphertextV1Schema,
  signatureSchema,
  timestampSchema,
} from './schemas/encodings'
import { identitySchema } from './schemas/identity'

const keychainItemSchema = z.object({
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  subkeyIndex: z.number().int(),
  encryptedKeychainName: secretBoxCiphertextV1Schema(PayloadType.string),
  encryptedKey: secretBoxCiphertextV1Schema(PayloadType.string),
  keychainFingerprint: fingerprintSchema,
  keyFingerprint: fingerprintSchema,
  ownerId: identitySchema.shape.userId,
  sharedBy: identitySchema.shape.userId.nullable(),
  signature: signatureSchema,
})

export const postKeychainItemRequestBody = keychainItemSchema
export type PostKeychainItemRequestBody = z.infer<
  typeof postKeychainItemRequestBody
>

export const getKeychainResponseBody = z.array(keychainItemSchema)
export type GetKeychainResponseBody = z.infer<typeof getKeychainResponseBody>
