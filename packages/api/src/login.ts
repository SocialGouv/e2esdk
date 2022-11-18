import { z } from 'zod'
import { fullIdentitySchema } from './schemas/identity'

export const loginResponseBody = fullIdentitySchema.pick({
  signaturePublicKey: true,
  signaturePrivateKey: true,
  sharingPublicKey: true,
  sharingPrivateKey: true,
})

export type LoginResponseBody = z.infer<typeof loginResponseBody>
