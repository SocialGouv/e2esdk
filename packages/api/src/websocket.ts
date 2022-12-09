import { z } from 'zod'

export enum WebSocketNotificationTypes {
  sharedKeyAdded = 'event:sharedKey:added',
  keychainUpdated = 'event:keychain:updated',
}

export const websocketNotificationTypesSchema = z.nativeEnum(
  WebSocketNotificationTypes
)
