import type { FastifyBaseLogger, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type { App } from '../types'

declare module 'fastify' {
  interface FastifyRequest {
    auditLog: FastifyBaseLogger
  }
}

/**
 * To filter the audit log, search for the property { category: "audit" }
 * in the NDJSON log stream.
 * The auth plugin overwrites it to inject authentication information.
 * It logs all outcomes to API calls for traceability.
 */
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
