import { HandleLogin } from '@47ng/opaque-server'
import {
  base64Bytes,
  identitySchema,
  loginFinal,
  LoginFinal,
  LoginFinalResponse,
  loginFinalResponse,
  loginRequest,
  LoginRequest,
  loginResponse,
  LoginResponse,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getUserDevice } from '../../database/models/devices.js'
import { getIdentity } from '../../database/models/identity.js'
import { env } from '../../env.js'
import { generateNonce } from '../../lib/opaque.js'
import { App } from '../../types'

const ephemeralLoginState = z.object({
  isValid: z.boolean(),
  loginState: base64Bytes(192),
  userId: identitySchema.shape.userId,
  deviceId: z.string().uuid(),
})
type EphemeralLoginState = z.infer<typeof ephemeralLoginState>

export default async function loginRoutes(app: App) {
  const redisKey = (nonce: string) =>
    app.redis.key(['auth', 'opaque', 'login', nonce])

  app.post<{
    Body: LoginRequest
    Reply: LoginResponse
  }>(
    '/login/request',
    {
      schema: {
        tags: ['auth'],
        summary: 'OPAQUE login start',
        body: zodToJsonSchema(loginRequest, { $refStrategy: 'none' }),
        response: {
          200: zodToJsonSchema(loginResponse, { $refStrategy: 'none' }),
        },
      },
    },
    async function loginRequest(req, res) {
      req.auditLog.trace({
        msg: 'loginRequest:init',
        body: req.body,
      })
      const deviceRecord = await getUserDevice(
        app.db,
        req.body.userId,
        req.body.deviceId
      )
      const login = new HandleLogin(env.OPAQUE_SERVER_SETUP)
      const loginResponse = app.sodium.to_base64(
        login.start(
          // Note: if no device record was found, keep performing
          // the OPAQUE login process to generate bogus key exchange,
          // to avoid enumerating user/device pairs to an attacker.
          deviceRecord
            ? app.sodium.from_base64(deviceRecord.opaqueCredentials)
            : undefined,
          app.sodium.from_string(req.body.userId),
          app.sodium.from_base64(req.body.loginRequest)
        )
      )
      const loginState: EphemeralLoginState = {
        isValid: Boolean(deviceRecord),
        userId: req.body.userId,
        deviceId: req.body.deviceId,
        loginState: app.sodium.to_base64(login.serialize()),
      }
      login.free()
      const nonce = generateNonce()
      await app.redis.client.setex(
        redisKey(nonce),
        120,
        JSON.stringify(loginState)
      )
      req.auditLog.info({
        msg: 'loginRequest:success',
        body: req.body,
      })
      return res.send({
        nonce,
        loginResponse,
      })
    }
  )

  // --

  app.post<{
    Body: LoginFinal
    Reply: LoginFinalResponse
  }>(
    '/login/final',
    {
      schema: {
        tags: ['auth'],
        summary: 'OPAQUE login finish',
        body: zodToJsonSchema(loginFinal, { $refStrategy: 'none' }),
        response: {
          200: zodToJsonSchema(loginFinalResponse, { $refStrategy: 'none' }),
        },
      },
    },
    async function loginFinal(req, res) {
      req.auditLog.trace({
        msg: 'loginFinal:init',
        body: req.body,
      })
      const loginState = ephemeralLoginState.safeParse(
        JSON.parse(
          (await app.redis.client.get(redisKey(req.body.nonce))) ?? '{}'
        )
      )
      if (!loginState.success || loginState.data.isValid === false) {
        const reason = 'Failed to complete login in time, please try again'
        req.auditLog.warn({ msg: 'loginFinal:timeout', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      const login = HandleLogin.deserialize(
        app.sodium.from_base64(loginState.data.loginState),
        env.OPAQUE_SERVER_SETUP
      )
      const sessionKey = login.finish(
        app.sodium.from_base64(req.body.loginFinal)
      )
      const sessionId = app.auth.getSessionId(sessionKey)
      app.sodium.memzero(sessionKey)
      const deviceRecord = await getUserDevice(
        app.db,
        loginState.data.userId,
        loginState.data.deviceId
      )
      const userRecord = await getIdentity(app.db, loginState.data.userId)
      if (!deviceRecord || !userRecord) {
        const reason = 'Failed to get device data'
        req.auditLog.warn({
          msg: 'loginFinal:notFound',
          body: req.body,
          reason,
          userRecord,
          deviceRecord,
          sessionId,
        })
        throw app.httpErrors.notFound(reason)
      }
      await app.auth.saveSession(sessionId, {
        identity: userRecord,
        deviceId: deviceRecord.id,
        ip: req.ip, // todo: Check with GDPR
      })
      await app.redis.client.del(redisKey(req.body.nonce))
      req.auditLog.info({
        msg: 'loginFinal:success',
        body: req.body,
        identity: userRecord,
        deviceId: req.headers['x-e2esdk-device-id'],
        sessionId,
      })
      return res.send({
        wrappedMainKey: deviceRecord.wrappedMainKey,
        deviceLabel: deviceRecord.label ?? undefined,
      })
    }
  )
}
