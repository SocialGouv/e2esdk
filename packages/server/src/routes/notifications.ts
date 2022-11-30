import {
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
  WebsocketNotificationTypes,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { notifyOfInsertsFor } from '../database/models/sharedKey.js'
import type { App } from '../types'

export default async function infoRoutes(app: App) {
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
      const channel = notifyOfInsertsFor(req.identity.userId)
      const listener = await app.db.listen(channel, () => {
        connection.socket.send(WebsocketNotificationTypes.sharedKeyAdded)
      })
      connection.on('close', () => {
        req.log.info(
          'Websocket closed by client, unregistering database listener'
        )
        listener.unlisten()
      })
    }
  )
}
