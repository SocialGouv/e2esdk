import { HandleRegistration } from '@47ng/opaque-server'
import {
  SignupCompleteResponse,
  signupCompleteResponse,
  signupRecord,
  SignupRecord,
  signupRequest,
  SignupRequest,
  signupResponse,
  SignupResponse,
} from '@socialgouv/e2esdk-api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createDevice } from '../../database/models/devices.js'
import { createIdentity } from '../../database/models/identity.js'
import { env } from '../../env.js'
import { generateNonce } from '../../lib/crypto.js'
import { App } from '../../types'

export default async function signupRoutes(app: App) {
  const redisKey = (nonce: string) =>
    app.redis.key(['auth', 'opaque', 'signup', nonce])

  app.post<{
    Body: SignupRequest
    Reply: SignupResponse
  }>(
    '/signup/request',
    {
      schema: {
        tags: ['auth'],
        summary: 'OPAQUE registration start',
        body: zodToJsonSchema(signupRequest, { $refStrategy: 'none' }),
        response: {
          200: zodToJsonSchema(signupResponse, { $refStrategy: 'none' }),
        },
      },
    },
    async function signupRequest(req, res) {
      req.auditLog.trace({
        msg: 'signupRequest:init',
        body: req.body,
      })
      if (env.DISABLE_SIGNUP) {
        const reason = 'Signup is not allowed on this server'
        req.auditLog.warn({ msg: 'signup:forbidden', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      if (!(await app.webhook.authorizeSignup(req))) {
        const reason = 'Signup not allowed by application server'
        req.auditLog.warn({ msg: 'signup:forbidden', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      const registration = new HandleRegistration(env.OPAQUE_SERVER_SETUP)
      const registrationResponse = app.sodium.to_base64(
        registration.start(
          app.sodium.from_string(req.body.userId),
          app.sodium.from_base64(req.body.registrationRequest)
        )
      )
      registration.free()
      const nonce = generateNonce()
      await app.redis.client.setex(redisKey(nonce), 120, req.body.userId)
      req.auditLog.info({
        msg: 'signupRequest:success',
        body: req.body,
        nonce,
        registrationResponse,
      })
      return res.send({
        nonce,
        registrationResponse,
      })
    }
  )

  // --

  app.post<{
    Body: SignupRecord
    Reply: SignupCompleteResponse
  }>(
    '/signup/record',
    {
      schema: {
        tags: ['auth'],
        summary: 'OPAQUE registration finish',
        body: zodToJsonSchema(signupRecord, { $refStrategy: 'none' }),
        response: {
          201: zodToJsonSchema(signupCompleteResponse, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function signupRecord(req, res) {
      req.auditLog.trace({
        msg: 'signupRecord:init',
        body: req.body,
      })
      if (env.DISABLE_SIGNUP) {
        const reason = 'Signup is not allowed on this server'
        req.auditLog.warn({ msg: 'signup:forbidden', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      const userId = await app.redis.client.get(redisKey(req.body.nonce))
      if (!userId) {
        const reason =
          'Failed to complete signup in time, please try signing up again'
        req.auditLog.warn({ msg: 'signup:timeout', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      const registration = new HandleRegistration(env.OPAQUE_SERVER_SETUP)
      const opaqueCredentials = app.sodium.to_base64(
        registration.finish(app.sodium.from_base64(req.body.registrationRecord))
      )
      const deviceId = await app.db.begin(
        async function createIdentityAndEnrollDeviceTransaction(tx) {
          await createIdentity(tx, {
            userId,
            proof: req.body.proof,
            sharingPublicKey: req.body.sharingPublicKey,
            signaturePublicKey: req.body.signaturePublicKey,
          })
          const deviceRecord = await createDevice(tx, {
            ownerId: userId,
            opaqueCredentials,
            label: req.body.deviceLabel ?? null,
            wrappedMainKey: req.body.wrappedMainKey,
            enrolledFrom: null,
          })
          // todo: Better error handling
          if (!deviceRecord) {
            throw new Error('Failed to enroll device')
          }
          return deviceRecord.id
        }
      )
      await app.redis.client.del(redisKey(req.body.nonce))
      req.auditLog.info({
        msg: 'signupRecord:success',
        body: req.body,
      })
      return res.status(201).send({
        deviceId,
      })
    }
  )
}
