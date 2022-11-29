import { z } from 'zod'
import {
  boxCiphertextV1Schema,
  fingerprintSchema,
  signedHashSchema,
  timestampSchema,
} from './schemas/encodings'
import { identitySchema } from './schemas/identity'

const sharedKey = z.object({
  createdAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  toUserId: identitySchema.shape.userId,
  fromUserId: identitySchema.shape.userId,
  fromSharingPublicKey: identitySchema.shape.sharingPublicKey,
  fromSignaturePublicKey: identitySchema.shape.signaturePublicKey,
  fromProof: identitySchema.shape.proof,
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
