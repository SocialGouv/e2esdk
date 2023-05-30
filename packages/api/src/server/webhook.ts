import { z } from 'zod'
import { postKeychainItemRequestBody } from '../keychain'
import { identitySchema } from '../schemas/identity'
import { postSharedKeyBody } from '../sharedKey'

export const webhookRoutes = {
  // Authorizations
  '/authorize/signup': {
    body: identitySchema.pick({ userId: true }),
  },
  '/authorize/key-share': {
    body: postSharedKeyBody,
  },
  // Notifications
  '/notify/signup': {
    body: identitySchema,
  },
  '/notify/key-added': {
    body: postKeychainItemRequestBody.omit({
      encryptedKeychainName: true,
      encryptedKey: true,
    }),
  },
  '/notify/key-shared': {
    body: postSharedKeyBody.omit({
      encryptedKeychainName: true,
      encryptedKey: true,
    }),
  },
} as const

export type WebhookRoutes = {
  [Path in keyof typeof webhookRoutes]: {
    body: z.infer<(typeof webhookRoutes)[Path]['body']>
  }
}
