import {
  Identity,
  isFarFromCurrentTime,
  publicKeyAuthHeaders,
} from '@e2esdk/api'
import {
  signAuth as signResponse,
  verifyAuth as verifyClientSignature,
  verifyClientIdentity,
} from '@e2esdk/crypto'
import type {
  FastifyBaseLogger,
  FastifyPluginAsync,
  FastifyRequest,
} from 'fastify'
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
    clientId: string
    auditLog: FastifyBaseLogger
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
        const parsed = publicKeyAuthHeaders.safeParse(headersOrQuery)
        if (!parsed.success) {
          req.log.error({
            msg: 'Missing public key authentication headers',
            error: parsed.error,
            remediation:
              "Set this route's querystring schema to `zodToJsonSchema(publicKeyAuthHeaders)` to validate the request before attempting authentication.",
          })
          throw app.httpErrors.badRequest('Missing public key headers')
        }
        const {
          'x-e2esdk-signature': signature,
          'x-e2esdk-timestamp': timestamp,
          'x-e2esdk-user-id': userId,
          'x-e2esdk-client-id': clientId,
        } = parsed.data
        if (isFarFromCurrentTime(timestamp)) {
          throw app.httpErrors.forbidden(
            'Request timestamp is too far off current time'
          )
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
                clientId,
              }
            )
          ) {
            throw new Error()
          }
        } catch {
          throw app.httpErrors.unauthorized('Invalid request signature')
        }
        req.identity = identity
        req.clientId = clientId
        req.auditLog = req.log.child({
          category: 'audit',
          identity,
          clientId,
        })
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
        clientId: req.clientId,
        recipientPublicKey: req.identity.signaturePublicKey,
      })
      res.header('x-e2esdk-user-id', req.identity.userId)
      res.header('x-e2esdk-client-id', req.clientId)
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
