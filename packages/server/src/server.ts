import { createServer as createFastifyServer } from 'fastify-micro'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from './env.js'
import { getTLSConfig } from './lib/tls.js'
import type { App } from './types'

export { startServer } from 'fastify-micro'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const healthCheckReply = z.object({
  services: z.object({
    database: z.object({
      status: z.enum(['starting', 'ok', 'down']),
      sizeUsed: z.number(),
      sizeMax: z.number(),
      sizeRatio: z.number(),
    }),
    redis: z.object({
      status: z.enum([
        'wait',
        'reconnecting',
        'connecting',
        'connect',
        'ready',
        'close',
        'end',
      ]),
    }),
  }),
  metrics: z.object({
    eventLoopDelay: z.number(),
    rssBytes: z.number(),
    heapUsed: z.number(),
    eventLoopUtilized: z.number(),
  }),
})

type HealthCheckReply = z.infer<typeof healthCheckReply>

export function createServer() {
  const __PROD__ = env.NODE_ENV === 'production'
  const https = getTLSConfig()
  const app = createFastifyServer({
    name: ['e2esdk', env.DEPLOYMENT_TAG].join(':'),
    https,
    redactLogPaths: env.DEBUG
      ? []
      : [
          // Redact personal information:
          'req.headers["user-agent"]',
          'req.headers["accept-language"]',
          // IP-containing headers:
          'req.headers["cf-connecting-ip"]',
          'req.headers["x-forwarded-for"]',
          'req.headers["forwarded"]',
        ],
    plugins: {
      dir: path.resolve(__dirname, 'plugins'),
      forceESM: true,
    },
    routes: {
      dir: path.resolve(__dirname, 'routes'),
      forceESM: true,
      options: {
        prefix: '/v1',
      },
    },
    printRoutes: __PROD__ ? 'logger' : false,
    sentry: {
      release: env.DEPLOYMENT_TAG,
      getUser(_app, request) {
        return Promise.resolve({
          id: request.identity?.userId,
        })
      },
      getExtra(_app, req) {
        return Promise.resolve({
          tags: {
            sharingPublicKey: req?.identity?.sharingPublicKey ?? 'N.A.',
            signaturePublicKey: req?.identity?.signaturePublicKey ?? 'N.A.',
            clientId: req?.clientId ?? 'N.A.',
            deviceId: req?.deviceId ?? 'N.A.',
            sessionId: req?.sessionId ?? 'N.A.',
          },
        })
      },
    },
    underPressure: {
      exposeStatusRoute: {
        url: '/_health',
        routeOpts: {
          logLevel: 'error',
        },
        routeResponseSchemaOpts: (zodToJsonSchema(healthCheckReply) as any)
          .properties,
      },
      healthCheck: async function healthCheck(
        app: App
      ): Promise<HealthCheckReply | false> {
        // The health check endpoint is queried every 5 seconds by
        // the `under-pressure` Fastify plugin, and optionally by
        // Docker's healthchecking mechanism.
        // It checks for a valid connection to PostgreSQL and Redis,
        // and reports system usage.
        // Any error encountered here trigger 503 responses on incoming
        // requests according to `under-pressure`'s configuration,
        // until the healthcheck resolves without error again.
        try {
          let sizeUsedQuery = await app.db<
            { sizeUsed: string }[]
          >`SELECT pg_database_size(current_database()::name) AS size_used`
          const sizeUsed = parseInt(sizeUsedQuery[0].sizeUsed)
          const sizeMax = env.DATABASE_MAX_SIZE_BYTES
          const sizeRatio = sizeMax > 0 ? sizeUsed / sizeMax : 0
          return {
            services: {
              database: {
                status: 'ok',
                sizeMax,
                sizeUsed,
                sizeRatio,
              },
              redis: {
                status: app.redis.client.status,
              },
            },
            metrics: app.memoryUsage(),
          }
        } catch (error) {
          app.log.error(error)
          app.sentry.report(error)
          return false
        }
      },
    },
    cleanupOnExit: async app => {
      app.log.info('Closing connections to backing services')
      const timeout = 5_000 // 5 seconds
      try {
        await Promise.all([app.db.end({ timeout }), app.redis.close(timeout)])
      } catch (error) {
        app.log.error(error)
        app.sentry.report(error)
      } finally {
        app.log.info('Closed all connections to backing services')
      }
    },
  })

  app.ready(() => {
    app.log.debug({
      msg: 'Plugins loaded',
      plugins: app
        .printPlugins()
        .split('\n')
        .filter(
          line =>
            !line.includes(' bound _after ') && !line.includes(' _default ')
        )
        .map(line =>
          line.replace(path.resolve(__dirname, '../../node_modules') + '/', '')
        )
        .join('\n'),
    })
    app.log.debug({
      msg: 'Routes loaded',
      routes: app.printRoutes({ commonPrefix: false, includeHooks: true }),
    })
    app.log.debug({ usingTLS: Boolean(https) })
  })

  return app
}
