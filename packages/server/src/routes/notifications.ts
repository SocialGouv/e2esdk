import { publicKeyAuthHeaders, WebSocketNotificationTypes } from '@e2esdk/api'
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
  app.db.listen(sharedKeyInsertsNotificationChannel, toUserId => {
    emitter.emit(
      [sharedKeyInsertsNotificationChannel, toUserId].join(':'),
      null
    )
  })
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
      const logger = req.log.child({
        category: 'websocket',
        identity: req.identity,
        clientId: req.clientId,
      })
      logger.info({
        msg: 'WebSocket connection established',
        context: req.query.context,
      })
      const sharedKeyForMe = [
        sharedKeyInsertsNotificationChannel,
        req.identity.userId,
      ].join(':')
      function sendSharedKeyAddedNotification() {
        connection.socket.send(WebSocketNotificationTypes.sharedKeyAdded)
      }
      emitter.on(sharedKeyForMe, sendSharedKeyAddedNotification)
      connection.socket.on('error', error =>
        logger.error({
          msg: 'WebSocket error',
          error,
        })
      )
      connection.socket.on('close', (code, reason) => {
        logger.info({
          msg: 'WebSocket connection closed',
          code,
          reason: reason.toString('utf8'),
        })
        emitter.off(sharedKeyForMe, sendSharedKeyAddedNotification)
      })
    }
  )
}
