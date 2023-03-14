import type { FastifyBaseLogger, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type { App } from '../types'

declare module 'fastify' {
  interface FastifyRequest {
    auditLog: FastifyBaseLogger
  }
}

const auditLogPlugin: FastifyPluginCallback = (app: App, _, pluginReady) => {
  app.decorateRequest('auditLog', null)
  app.addHook('onRequest', (req, _, hookReady) => {
    req.auditLog = req.log.child({
      category: 'audit',
      identity: null,
      deviceId: null,
      sessionId: null,
    })
    hookReady()
  })
  pluginReady()
}

export default fp(auditLogPlugin, {
  fastify: '4.x',
  name: 'auditLog',
})
