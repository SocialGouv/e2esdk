import {
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
  WebsocketNotificationTypes,
} from '@e2esdk/api'
import mitt from 'mitt'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { sharedKeyInsertsNotificationChannel } from '../database/models/sharedKey.js'
import type { App } from '../types'

export default async function notificationsRoutes(app: App) {
  // We use a central EventEmitter pattern to have only a single
  // listening connection to the database, then fan out here
  // to forward to the correct websocket connection.
  const emitter = mitt()
  app.db.listen(sharedKeyInsertsNotificationChannel, toUserId =>
    emitter.emit(`sharedKeyInserted:${toUserId}`, null)
  )
  app.get<{
    Querystring: PublicKeyAuthHeaders
  }>(
    '/notifications',
    {
      websocket: true,
      preValidation: app.usePublicKeyAuth({
        mode: 'websocket',
      }),
      schema: {
        querystring: zodToJsonSchema(publicKeyAuthHeaders),
      },
    },
    async function websocketNotifications(connection, req) {
      const sharedKeyForMe = `sharedKeyInserted:${req.identity.userId}}`
      function onSharedKeyInsertedForMe() {
        connection.socket.send(WebsocketNotificationTypes.sharedKeyAdded)
      }
      emitter.on(sharedKeyForMe, onSharedKeyInsertedForMe)
      connection.on('close', () => {
        req.log.info(
          'Websocket closed by client, unregistering database listener'
        )
        emitter.off(sharedKeyForMe, onSharedKeyInsertedForMe)
      })
    }
  )
}
