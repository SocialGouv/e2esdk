import { publicKeyAuthHeaders, WebsocketNotificationTypes } from '@e2esdk/api'
import mitt from 'mitt'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { sharedKeyInsertsNotificationChannel } from '../database/models/sharedKey.js'
import type { App } from '../types'

const querystringSchema = publicKeyAuthHeaders.extend({
  context: z.string(),
})

export default async function notificationsRoutes(app: App) {
  // We use a central EventEmitter pattern to have only a single
  // listening connection to the database, then fan out here
  // to forward to the correct websocket connection.
  const emitter = mitt()
  app.db.listen(sharedKeyInsertsNotificationChannel, toUserId =>
    emitter.emit(`sharedKeyInserted:${toUserId}`, null)
  )
  app.get<{
    Querystring: z.infer<typeof querystringSchema>
  }>(
    '/notifications',
    {
      websocket: true,
      preValidation: app.usePublicKeyAuth({
        mode: 'websocket',
      }),
      schema: {
        querystring: zodToJsonSchema(querystringSchema),
      },
    },
    async function websocketNotifications(connection, req) {
      req.log.info({
        msg: 'WebSocket connection established',
        context: req.query.context,
        identity: req.identity,
        clientId: req.clientId,
      })
      const sharedKeyForMe = `sharedKeyInserted:${req.identity.userId}}`
      function onSharedKeyInsertedForMe() {
        connection.socket.send(WebsocketNotificationTypes.sharedKeyAdded)
      }
      emitter.on(sharedKeyForMe, onSharedKeyInsertedForMe)
      connection.on('close', () => {
        req.log.info({
          msg: 'Websocket closed by client, unregistering database listener',
          identity: req.identity,
          clientId: req.clientId,
        })
        emitter.off(sharedKeyForMe, onSharedKeyInsertedForMe)
      })
    }
  )
}
