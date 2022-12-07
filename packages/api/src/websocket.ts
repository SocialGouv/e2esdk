import { z } from 'zod'

export enum WebSocketNotificationTypes {
  sharedKeyAdded = 'event:sharedKey:added',
}

export const websocketNotificationTypesSchema = z.nativeEnum(
  WebSocketNotificationTypes
)
