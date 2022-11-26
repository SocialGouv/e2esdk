import { z } from 'zod'
import {
  boxCiphertextV1Schema,
  fingerprintSchema,
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
  name: boxCiphertextV1Schema,
  payload: boxCiphertextV1Schema,
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
