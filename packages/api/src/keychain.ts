import { z } from 'zod'
import {
  fingerprintSchema,
  secretBoxCiphertextV1Schema,
  signedHashSchema,
  timestampSchema,
} from './schemas/encodings'
import { identitySchema } from './schemas/identity'

const keychainItemSchema = z.object({
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  name: secretBoxCiphertextV1Schema,
  payload: secretBoxCiphertextV1Schema,
  nameFingerprint: fingerprintSchema,
  payloadFingerprint: fingerprintSchema,
  ownerId: identitySchema.shape.userId,
  sharedBy: identitySchema.shape.userId.nullable(),
  signature: signedHashSchema,
})

export const postKeychainItemRequestBody = keychainItemSchema
export type PostKeychainItemRequestBody = z.infer<
  typeof postKeychainItemRequestBody
>

export const getKeychainResponseBody = z.array(keychainItemSchema)
export type GetKeychainResponseBody = z.infer<typeof getKeychainResponseBody>
