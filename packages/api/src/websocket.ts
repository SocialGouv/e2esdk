import { z } from 'zod'

export const WebSocketNotificationTypes = {
  sharedKeyAdded: 'event:sharedKey:added',
  keychainUpdated: 'event:keychain:updated',
} as const

export const websocketNotificationTypesSchema = z.nativeEnum(
  WebSocketNotificationTypes
)
