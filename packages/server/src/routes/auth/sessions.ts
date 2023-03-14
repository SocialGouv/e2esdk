import {
  ActiveSession,
  activeSessionSchema,
  getActiveSessionsResponseBody,
  GetActiveSessionsResponseBody,
  requestHeaders,
  RequestHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { decryptSession } from '../../plugins/auth.js'
import { App } from '../../types'

export default async function sessionsRoutes(app: App) {
  async function scanRedisSessionKeys(userId: string) {
    const keyPattern = app.auth.getRedisSessionKey(userId, '*')
    let keys: string[] = []
    let cursor = '0'
    while (true) {
      const [newCursor, results] = await app.redis.client.scan(
        cursor,
        'MATCH',
        keyPattern
      )
      keys = keys.concat(results)
      if (newCursor === '0') {
        break
      }
      cursor = newCursor
    }
    return keys
  }

  app.get<{
    Headers: RequestHeaders
    Reply: GetActiveSessionsResponseBody
  }>(
    '/sessions',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'sessions'],
        summary: 'List active sessions for the logged-in user',
        headers: zodToJsonSchema(requestHeaders, { $refStrategy: 'none' }),
        response: {
          200: zodToJsonSchema(getActiveSessionsResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function listActiveSessions(req, res) {
      req.auditLog.trace('listActiveSessions:init')
      const redisSessionKeys = await scanRedisSessionKeys(req.identity.userId)
      const activeSessions: ActiveSession[] = []
      for (const redisKey of redisSessionKeys) {
        try {
          const sessionId = redisKey.slice(redisKey.lastIndexOf(':') + 1)
          const sessionData = await decryptSession(
            req,
            req.identity.userId,
            sessionId
          )
          // todo: Get device label from database
          activeSessions.push({
            deviceId: sessionData.deviceId,
            ip: sessionData.ip,
            sessionId,
          })
        } catch {
          continue
        }
      }
      req.auditLog.info({
        msg: 'listActiveSessions:success',
        activeSessions,
      })
      return res.send(activeSessions)
    }
  )

  app.delete(
    '/sessions',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'sessions'],
        summary: 'Revoke all other active sessions for the logged-in user',
        description: 'But keep the current session active',
        headers: zodToJsonSchema(requestHeaders, { $refStrategy: 'none' }),
        response: {
          204: {
            type: 'null',
          },
        },
      },
    },
    async function revokeOtherSessions(req, res) {
      req.auditLog.trace('revokeOtherSessions:init')
      const currentRedisSessionKey = req.server.auth.getRedisSessionKey(
        req.identity.userId,
        req.sessionId
      )
      const redisSessionKeys = new Set(
        await scanRedisSessionKeys(req.identity.userId)
      )
      // Maintain the current session
      redisSessionKeys.delete(currentRedisSessionKey)
      await req.server.redis.client.del(Array.from(redisSessionKeys))
      req.auditLog.info({
        msg: 'revokeOtherSessions:success',
        revokedSessionIds: Array.from(redisSessionKeys).map(k =>
          k.slice(k.lastIndexOf(':') + 1)
        ),
      })
      return res.status(204).send()
    }
  )

  const revokeSessionUrlParams = z.object({
    sessionId: activeSessionSchema.shape.sessionId,
  })
  app.delete<{
    Params: z.infer<typeof revokeSessionUrlParams>
    Headers: RequestHeaders
  }>(
    '/sessions/:sessionId',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'sessions'],
        summary: 'Revoke an active session',
        params: zodToJsonSchema(revokeSessionUrlParams, {
          $refStrategy: 'none',
        }),
        headers: zodToJsonSchema(requestHeaders, { $refStrategy: 'none' }),
        response: {
          204: {
            type: 'null',
          },
        },
      },
    },
    async function revokeSession(req, res) {
      req.auditLog.trace({
        msg: 'revokeSession:init',
        params: req.params,
      })
      const redisKey = req.server.auth.getRedisSessionKey(
        req.identity.userId,
        req.params.sessionId
      )
      const removed = await req.server.redis.client.del(redisKey)
      req.auditLog.info({
        msg: 'revokeSession:success',
        params: req.params,
        revoked: removed === 1,
      })
      return res.status(204).send()
    }
  )
}
