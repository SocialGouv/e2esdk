import { z } from 'zod'

export enum WebsocketNotificationTypes {
  sharedKeyAdded = 'event:sharedKey:added',
}

export const websocketNotificationTypesSchema = z.nativeEnum(
  WebsocketNotificationTypes
)
