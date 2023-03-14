import {
  requestHeaders,
  WebSocketNotificationTypes,
} from '@socialgouv/e2esdk-api'
import mitt from 'mitt'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { keychainUpdatedNotificationChannel } from '../database/models/keychain.js'
import { sharedKeyInsertsNotificationChannel } from '../database/models/sharedKey.js'
import type { App } from '../types'

const querystringSchema = requestHeaders.extend({
  context: z.string(),
})

export default async function notificationsRoutes(app: App) {
  // We use a central EventEmitter pattern to have only a single
  // listening connection to the database, then fan out here
  // to forward to the correct websocket connection.
  const emitter = mitt()
  app.db.listen(keychainUpdatedNotificationChannel, ownerId => {
    emitter.emit([keychainUpdatedNotificationChannel, ownerId].join(':'), null)
  })
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
      preHandler: app.useAuth({
        mode: 'websocket',
      }),
      schema: {
        summary: 'WebSocket notifications',
        querystring: zodToJsonSchema(querystringSchema),
      },
    },
    async function websocketNotifications(connection, req) {
      req.auditLog.trace({
        msg: 'notifications:connected',
        context: req.query.context,
      })
      // Keychain --
      const keychainUpdated = [
        keychainUpdatedNotificationChannel,
        req.identity.userId,
      ].join(':')
      function sendKeychainUpdatedNotification() {
        const data = WebSocketNotificationTypes.keychainUpdated
        req.auditLog.trace({ msg: 'notifications:send', data })
        connection.socket.send(data)
      }
      emitter.on(keychainUpdated, sendKeychainUpdatedNotification)

      // Shared keys --
      const sharedKeyForMe = [
        sharedKeyInsertsNotificationChannel,
        req.identity.userId,
      ].join(':')
      function sendSharedKeyAddedNotification() {
        const data = WebSocketNotificationTypes.sharedKeyAdded
        req.auditLog.trace({ msg: 'notifications:send', data })
        connection.socket.send(data)
      }
      emitter.on(sharedKeyForMe, sendSharedKeyAddedNotification)
      connection.socket.on('error', error =>
        req.auditLog.error({
          msg: 'notifications:error',
          error,
        })
      )
      connection.socket.on('close', (code, reason) => {
        req.auditLog.trace({
          msg: 'notifications:disconnected',
          code,
          reason: reason.toString('utf8'),
        })
        emitter.off(sharedKeyForMe, sendSharedKeyAddedNotification)
        emitter.off(keychainUpdated, sendKeychainUpdatedNotification)
      })
    }
  )
}
