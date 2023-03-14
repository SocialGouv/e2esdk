import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import '../env.js'
import { env } from '../env.js'
import type { App } from '../types'

type RedisDecoration = {
  client: Redis
  close: (timeoutMs: number) => Promise<void>
  key: (parts: string[]) => string
}

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisDecoration
  }
}

const redisPlugin: FastifyPluginAsync = async (app: App) => {
  const client = new Redis(env.REDIS_URL)
  async function close(timeoutMs: number) {
    app.log.info('Redis is shutting down')
    await client.quit()
    return new Promise<void>(resolve => {
      const t = setTimeout(() => {
        app.log.warn(
          `Redis did not quit cleanly within ${timeoutMs}ms, disconnecting. This may result in data loss.`
        )
        client.disconnect()
        resolve()
      }, timeoutMs)
      client.on('end', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  app.decorate<RedisDecoration>('redis', {
    client,
    close,
    key(parts) {
      return ['e2esdk', ...parts].join(':')
    },
  })
}

export default fp(redisPlugin, {
  fastify: '4.x',
  name: 'redis',
})
