import { Identity, isFarFromCurrentTime } from '@e2esdk/api'
import {
  signAuth as signResponse,
  verifyAuth as verifyClientSignature,
  verifyClientIdentity,
} from '@e2esdk/crypto'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { getIdentity as getIdentityFromDatabase } from '../database/models/identity.js'
import { env } from '../env.js'
import type { App } from '../types'

type PublicKeyAuthOptions = {
  mode?: 'http' | 'websocket'
  // todo: Use better type for request
  getIdentity?: 'database' | ((req: any) => Identity | null)
}

declare module 'fastify' {
  interface FastifyInstance {
    usePublicKeyAuth: (
      options?: PublicKeyAuthOptions
    ) => (req: FastifyRequest) => Promise<any>
  }

  interface FastifyRequest {
    identity: Identity
  }
}

const publicKeyAuthPlugin: FastifyPluginAsync = async (app: App) => {
  const serverPrivateKey = app.sodium.from_base64(env.SIGNATURE_PRIVATE_KEY)
  const serverPublicKey = app.sodium.from_base64(env.SIGNATURE_PUBLIC_KEY)

  app.decorate(
    'usePublicKeyAuth',
    ({ mode = 'http', getIdentity = 'database' }: PublicKeyAuthOptions = {}) =>
      async function usePublicKeyAuth(req: FastifyRequest) {
        const headersOrQuery =
          mode === 'http' ? req.headers : (req.query as Record<string, string>)
        const userId = headersOrQuery['x-e2esdk-user-id'] as string
        if (!userId) {
          throw app.httpErrors.badRequest('Missing x-e2esdk-user-id header')
        }
        const timestamp = headersOrQuery['x-e2esdk-timestamp'] as string
        if (!timestamp) {
          throw app.httpErrors.badRequest('Missing x-e2esdk-timestamp header')
        }
        if (isFarFromCurrentTime(timestamp)) {
          throw app.httpErrors.forbidden(
            'Request timestamp is too far off current time'
          )
        }
        const signature = headersOrQuery['x-e2esdk-signature'] as string
        if (!signature) {
          throw app.httpErrors.badRequest('Missing x-e2esdk-signature header')
        }
        const identity =
          getIdentity === 'database'
            ? await getIdentityFromDatabase(app.db, userId)
            : getIdentity(req)
        if (!identity) {
          throw app.httpErrors.unauthorized(
            `No identity found for user ID ${userId}`
          )
        }
        if (identity.userId !== userId) {
          throw app.httpErrors.badRequest('Invalid user ID')
        }
        if (!verifyClientIdentity(app.sodium, identity)) {
          throw app.httpErrors.unauthorized('Invalid identity')
        }
        try {
          const url = new URL(req.url, env.DEPLOYMENT_URL)
          if (mode === 'websocket') {
            // When using the querystring as transport for
            // the public key authentication headers (websocket),
            // the client will have computed the signature on
            // the URL before adding it to the URL itself,
            // so we remove it before verifying the signature,
            // otherwise we have a snake eating its own tail.
            url.searchParams.delete('x-e2esdk-signature')
            // The protocol is also different:
            url.protocol = url.protocol.replace('http', 'ws')
          }
          if (
            !verifyClientSignature(
              app.sodium,
              app.sodium.from_base64(identity.signaturePublicKey),
              signature,
              {
                timestamp,
                method: req.method,
                url: url.toString(),
                body: JSON.stringify(req.body),
                recipientPublicKey: serverPublicKey,
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
      res.header('x-e2esdk-server-pubkey', env.SIGNATURE_PUBLIC_KEY)
      if (!req.identity) {
        return body
      }
      const signature = signResponse(app.sodium, serverPrivateKey, {
        timestamp,
        method: req.method,
        url: `${env.DEPLOYMENT_URL}${req.url}`,
        body,
        userId: req.identity.userId,
        recipientPublicKey: req.identity.signaturePublicKey,
      })
      res.header('x-e2esdk-user-id', req.identity.userId)
      res.header('x-e2esdk-timestamp', timestamp)
      res.header('x-e2esdk-signature', signature)
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
