import websocket from '@fastify/websocket'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { App } from '../types'

const websocketPlugin: FastifyPluginAsync = async (app: App) => {
  return app.register(websocket)
}

export default fp(websocketPlugin, {
  fastify: '4.x',
  name: 'websocket',
})
