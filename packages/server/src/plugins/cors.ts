import cors, { FastifyCorsOptions } from '@fastify/cors'
import { requestHeaders, responseHeaders } from '@socialgouv/e2esdk-api'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../env.js'
import type { App } from '../types'

const corsPlugin: FastifyPluginAsync = async (app: App) => {
  const options: FastifyCorsOptions = {
    origin:
      env.NODE_ENV === 'production' || env.CORS_FORCE_ENABLE
        ? env.CORS_ALLOWED_ORIGINS
        : '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['content-type', ...requestHeaders.keyof().options],
    exposedHeaders: responseHeaders.keyof().options,
    maxAge: 3600, // 1h
  }

  app.log.debug({ msg: 'CORS options', options })
  return app.register(cors, options)
}

export default fp(corsPlugin, {
  fastify: '4.x',
  name: 'cors',
})
