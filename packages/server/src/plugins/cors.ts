import cors from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../env.js'
import type { App } from '../types'

const corsPlugin: FastifyPluginAsync = async (app: App) => {
  const origin =
    env.NODE_ENV === 'production' || env.CORS_FORCE_ENABLE
      ? env.CORS_ALLOWED_ORIGINS
      : '*'
  app.log.info({
    msg: 'CORS setup',
    origin,
  })
  app.register(cors, {
    origin,
  })
}

export default fp(corsPlugin, {
  fastify: '4.x',
  name: 'cors',
})
