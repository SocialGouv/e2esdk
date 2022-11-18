import type { PublicIdentity } from '@e2esdk/api'
import { isFarFromCurrentTime } from '@e2esdk/core'
import {
  sign as signResponse,
  verify as verifyClientSignature,
} from '@e2esdk/crypto'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { getPublicIdentity } from '../database/models/identity.js'
import type { App } from '../types'

type PublicKeyAuthOptions = {
  // todo: Use better type for request
  getIdentity?: 'database' | ((req: any) => PublicIdentity | null)
}

declare module 'fastify' {
  interface FastifyInstance {
    usePublicKeyAuth: (
      options?: PublicKeyAuthOptions
    ) => (req: FastifyRequest) => Promise<any>
  }

  interface FastifyRequest {
    identity: PublicIdentity
  }
}

const publicKeyAuthPlugin: FastifyPluginAsync = async (app: App) => {
  const serverPrivateKey = app.sodium.from_base64(
    process.env.SIGNATURE_PRIVATE_KEY
  )
  const serverPublicKey = app.sodium.from_base64(
    process.env.SIGNATURE_PUBLIC_KEY
  )

  app.decorate(
    'usePublicKeyAuth',
    ({ getIdentity = 'database' }: PublicKeyAuthOptions = {}) =>
      async function usePublicKeyAuth(req: FastifyRequest) {
        const userId = req.headers['x-e2esdk-user-id'] as string
        if (!userId) {
          throw app.httpErrors.badRequest('Missing x-e2esdk-user-id header')
        }
        const timestamp = req.headers['x-e2esdk-timestamp'] as string
        if (!timestamp) {
          throw app.httpErrors.badRequest('Missing x-e2esdk-timestamp header')
        }
        if (isFarFromCurrentTime(timestamp)) {
          throw app.httpErrors.forbidden(
            'Request timestamp is too far off current time'
          )
        }
        const signature = req.headers['x-e2esdk-signature'] as string
        if (!signature) {
          throw app.httpErrors.unauthorized('Missing x-e2esdk-signature header')
        }
        const identity =
          getIdentity === 'database'
            ? await getPublicIdentity(app.db, userId)
            : getIdentity(req)
        if (!identity) {
          throw app.httpErrors.unauthorized(
            `No identity found for user ID ${userId}`
          )
        }
        if (identity.userId !== userId) {
          throw app.httpErrors.badRequest('Invalid user ID')
        }

        try {
          if (
            !verifyClientSignature(
              app.sodium,
              app.sodium.from_base64(identity.signaturePublicKey),
              signature,
              {
                timestamp,
                method: req.method,
                url: `${process.env.DEPLOYMENT_URL}${req.url}`,
                body: JSON.stringify(req.body),
                serverPublicKey,
                clientPublicKey: identity.signaturePublicKey,
                userId: identity.userId,
              }
            )
          ) {
            throw new Error()
          }
        } catch {
          throw app.httpErrors.unauthorized('Invalid request signature')
        }

        req.identity = identity
      }
  )

  app.addHook(
    'onSend',
    async function signServerResponse(req, res, body: string) {
      const timestamp = new Date().toISOString()
      const signature = signResponse(app.sodium, serverPrivateKey, {
        timestamp,
        method: req.method,
        url: `${process.env.DEPLOYMENT_URL}${req.url}`,
        body,
        userId: req.identity?.userId,
        serverPublicKey: process.env.SIGNATURE_PUBLIC_KEY,
        clientPublicKey: req.identity?.signaturePublicKey,
      })
      if (req.identity?.userId) {
        res.header('x-e2esdk-user-id', req.identity.userId)
      }
      res.header('x-e2esdk-timestamp', timestamp)
      res.header('x-e2esdk-signature', signature)
      res.header('x-e2esdk-server-pubkey', process.env.SIGNATURE_PUBLIC_KEY)
      return body
    }
  )
}

export default fp(publicKeyAuthPlugin, {
  fastify: '4.x',
  name: 'publicKeyAuth',
  dependencies: ['sodium', 'database'],
  decorators: {
    fastify: ['sodium', 'db'],
  },
})
