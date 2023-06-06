import websocket from '@fastify/websocket'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { App } from '../types'

/**
 * WebSocket is used for notification of changes in the database
 * (Pub/Sub), and to keep all e2esdk clients in real-time sync.
 * See routes/notifications.ts for usage.
 */
const websocketPlugin: FastifyPluginAsync = async (app: App) => {
  return app.register(websocket)
}

export default fp(websocketPlugin, {
  fastify: '4.x',
  name: 'websocket',
})
