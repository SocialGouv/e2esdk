import { z } from 'zod'
import {
  fingerprintSchema,
  secretBoxCiphertextV1Schema,
  signedHashSchema,
  timestampSchema,
} from './schemas/encodings'
import { publicIdentitySchema } from './schemas/identity'

const sharedKey = z.object({
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  toUserId: publicIdentitySchema.shape.userId,
  fromUserId: publicIdentitySchema.shape.userId,
  fromSharingPublicKey: publicIdentitySchema.shape.sharingPublicKey,
  fromSignaturePublicKey: publicIdentitySchema.shape.signaturePublicKey,
  name: secretBoxCiphertextV1Schema,
  payload: secretBoxCiphertextV1Schema,
  nameFingerprint: fingerprintSchema,
  payloadFingerprint: fingerprintSchema,
  signature: signedHashSchema,
})

// --

export const postSharedKeyBody = sharedKey
export type PostSharedKeyBody = z.infer<typeof postSharedKeyBody>

export const getSharedKeysResponseBody = z.array(sharedKey)
export type GetSharedKeysResponseBody = z.infer<
  typeof getSharedKeysResponseBody
>
