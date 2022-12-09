import { z } from 'zod'
import {
  fingerprintSchema,
  secretBoxCiphertextV1Schema,
  signatureSchema,
  timestampSchema,
} from './schemas/encodings'
import { identitySchema } from './schemas/identity'

const keychainItemSchema = z.object({
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  subkeyIndex: z.number().int(),
  name: secretBoxCiphertextV1Schema('txt'),
  payload: secretBoxCiphertextV1Schema('txt'),
  nameFingerprint: fingerprintSchema,
  payloadFingerprint: fingerprintSchema,
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
