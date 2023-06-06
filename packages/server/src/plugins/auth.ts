import {
  activeSessionSchema,
  Identity,
  identitySchema,
  isFarFromCurrentTime,
  requestHeaders,
} from '@socialgouv/e2esdk-api'
import {
  decrypt,
  encrypt,
  fingerprint,
  SecretBoxCipher,
  signAuth as signResponse,
  verifyClientIdentity,
  verifyAuth as verifyClientSignature,
} from '@socialgouv/e2esdk-crypto'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import crypto from 'node:crypto'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '../env.js'
import type { App } from '../types'

/**
 * Sessions are short-lived (1 hour), but can be automatically
 * refreshed on 401 Unauthorized if the e2esdk client is configured
 * to do so (it is the case by default).
 */
const AUTH_SESSION_TTL = 60 * 60 // seconds

const sessionDataSchema = activeSessionSchema
  .pick({
    deviceId: true,
    ip: true,
  })
  .extend({
    identity: identitySchema,
  })

type SessionData = z.infer<typeof sessionDataSchema>

type AuthOptions = {
  /**
   * Most authenticated calls to the API go through the HTTP protocol,
   * where authentication data is passed via request headers.
   * However, since we can't use headers in a WebSocket upgrade request
   * from the browser, auth data is then passed via the query string.
   * This tells the authentication plugin where to look for auth data.
   */
  protocol?: 'http' | 'websocket'
}

type AuthDecoration = {
  /**
   * Derive the OPAQUE binary session key into a session ID string.
   */
  getSessionId(opaqueSessionKey: Uint8Array): string

  /**
   * Redis keys for session storage are bound to a user and their session ID.
   * This allows the server to enumerate all of a user's sessions (see `getRedisSessionKeys`).
   */
  getRedisSessionKey(userId: string, sessionId: string): string

  /**
   * Query Redis for all of a user's active sessions, and return the
   * correspondis Redis keys.
   */
  getRedisSessionKeys(userId: string): Promise<string[]>

  /**
   * Save session data into Redis. Invoked at the end of the login process.
   */
  saveSession(sessionId: string, sessionData: SessionData): Promise<'OK'>

  /**
   * JSON Schema for authentication headers, precomputed here
   * and used when definining header parsers in route handlers.
   */
  headers: ReturnType<typeof zodToJsonSchema>
}

declare module 'fastify' {
  interface FastifyInstance {
    useAuth(options?: AuthOptions): (req: FastifyRequest) => Promise<any>
    auth: AuthDecoration
  }
  interface FastifyRequest {
    /**
     * Public user identity of the authenticated user making the request
     */
    identity: Readonly<Identity>

    /**
     * UUID of the e2esdk client instance making the request
     */
    clientId: string

    /**
     * UUID of the device where the request originated
     */
    deviceId: string

    /**
     * Session ID is derived from the OPAQUE key agreement established at login.
     * It is agreed by both parties without being exchanged.
     */
    sessionId: string
  }
}

const authPlugin: FastifyPluginAsync = async (app: App) => {
  const serverPrivateKey = app.sodium.from_base64(env.SIGNATURE_PRIVATE_KEY)
  const serverPublicKey = app.sodium.from_base64(env.SIGNATURE_PUBLIC_KEY)

  function getRedisSessionKey(userId: string, sessionId: string) {
    return app.redis.key(['auth', 'session', userId, sessionId])
  }

  app.decorate<AuthDecoration>('auth', {
    getRedisSessionKey,
    getSessionId(opaqueSessionKey) {
      return fingerprint(app.sodium, opaqueSessionKey)
    },
    saveSession(sessionId, sessionData) {
      const redisKey = getRedisSessionKey(
        sessionData.identity.userId,
        sessionId
      )
      // Session data is encrypted before being stored on Redis,
      // using a symmetric cipher based on a provided secret.
      // Multiple secrets are availble for decryption to allow rotation,
      // but only the first secret in the list is used for encryption.
      const cipher = deriveSessionCipher(
        env.SESSION_SECRETS[0],
        app.sodium.from_base64(sessionId)
      )
      const payload = encrypt(
        app.sodium,
        sessionData,
        cipher,
        // Use the Redis key as authenticated data (AEAD)
        // to ensure a strong key/value bond:
        app.sodium.from_string(redisKey),
        'application/e2esdk.ciphertext.v1'
      )
      app.sodium.memzero(cipher.key)
      return app.redis.client.setex(
        getRedisSessionKey(sessionData.identity.userId, sessionId),
        AUTH_SESSION_TTL,
        payload
      )
    },
    async getRedisSessionKeys(userId) {
      const keyPattern = getRedisSessionKey(userId, '*')
      let keys: string[] = []
      let cursor = '0'
      // Iterate through the keyspace in a streaming manner,
      // rather than blocking the Redis client with a KEYS command.
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
    },
    headers: zodToJsonSchema(requestHeaders, { $refStrategy: 'none' }),
  })

  app.decorate(
    'useAuth',
    ({ protocol = 'http' }: AuthOptions = {}) =>
      async function useAuth(req: FastifyRequest) {
        // First, load and parse the authentication header data
        const headersOrQuery =
          protocol === 'http'
            ? req.headers
            : (req.query as Record<string, string>)
        const parsedHeaders = requestHeaders.safeParse(headersOrQuery)
        if (!parsedHeaders.success) {
          req.log.warn({
            msg: 'Missing public key authentication headers',
            error: parsedHeaders.error,
            remediation:
              "Set this route's querystring schema to `zodToJsonSchema(requestHeaders)` to validate the request before attempting authentication.",
          })
          throw req.server.httpErrors.badRequest(
            'Missing public key authentication headers'
          )
        }
        const {
          'x-e2esdk-user-id': userId,
          'x-e2esdk-client-id': clientId,
          'x-e2esdk-session-id': sessionId,
          'x-e2esdk-timestamp': timestamp,
          'x-e2esdk-signature': signature,
        } = parsedHeaders.data

        // Timestamp is here to prevent replay attacks,
        // only queries made recently are allowed to go through.
        if (isFarFromCurrentTime(timestamp)) {
          throw req.server.httpErrors.forbidden(
            'Request timestamp is too far off current time'
          )
        }
        const sessionData = await decryptSession(req, userId, sessionId)
        const url = new URL(req.url, env.DEPLOYMENT_URL)
        if (protocol === 'websocket') {
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
        const signatureItems = {
          timestamp,
          method: req.method,
          url: url.toString(),
          body: JSON.stringify(req.body),
          userId: sessionData.identity.userId,
          clientId,
          deviceId: sessionData.deviceId,
          sessionId,
          recipientPublicKey: serverPublicKey,
        }
        if (
          !verifyClientSignature(
            req.server.sodium,
            req.server.sodium.from_base64(
              sessionData.identity.signaturePublicKey
            ),
            signature,
            signatureItems
          )
        ) {
          const msg = 'Invalid request signature'
          req.log.debug({ msg, signatureItems })
          throw req.server.httpErrors.unauthorized(msg)
        }
        req.sessionId = sessionId
        req.clientId = clientId
        req.identity = Object.freeze(sessionData.identity)
        req.deviceId = sessionData.deviceId
        req.auditLog = req.auditLog.child({
          identity: req.identity,
          clientId,
          deviceId: req.deviceId,
          sessionId,
        })
      }
  )

  app.addHook(
    'onSend',
    async function signServerResponse(req, res, body: string) {
      // todo: Refactor this to allow caching (drop timestamp signing)
      const timestamp = new Date().toISOString()
      res.header('x-e2esdk-server-pubkey', env.SIGNATURE_PUBLIC_KEY)
      if (!req.identity) {
        return body
      }
      const signature = signResponse(req.server.sodium, serverPrivateKey, {
        timestamp,
        method: req.method,
        url: `${env.DEPLOYMENT_URL}${req.url}`,
        body,
        userId: req.identity.userId,
        clientId: req.clientId,
        deviceId: req.deviceId,
        sessionId: req.sessionId,
        recipientPublicKey: req.identity.signaturePublicKey,
      })
      res.header('x-e2esdk-timestamp', timestamp)
      res.header('x-e2esdk-signature', signature)
      return body
    }
  )
}

export async function decryptSession(
  req: FastifyRequest,
  userId: string,
  sessionId: string
) {
  const unauthorizedMessage = 'Unauthorized: missing or invalid sessionId'
  let sessionCipherIndex = 0
  const redisKey = req.server.auth.getRedisSessionKey(userId, sessionId)
  const redisData = await req.server.redis.client.get(redisKey)
  if (!redisData) {
    throw req.server.httpErrors.unauthorized(unauthorizedMessage)
  }
  const sessionIdBytes = req.server.sodium.from_base64(sessionId)
  for (const sessionSecret of env.SESSION_SECRETS) {
    try {
      const sessionCipher = deriveSessionCipher(sessionSecret, sessionIdBytes)
      const sessionData = sessionDataSchema.parse(
        decrypt(
          req.server.sodium,
          redisData,
          sessionCipher,
          // Use the Redis key as authenticated data
          // to ensure a strong key/value bond:
          req.server.sodium.from_string(redisKey)
        )
      )
      req.server.sodium.memzero(sessionCipher.key)
      if (!verifyClientIdentity(req.server.sodium, sessionData.identity)) {
        req.auditLog.warn({
          msg: 'Failed to verify client identity',
          identity: sessionData.identity,
          clientId: req.headers['x-e2esdk-client-id'],
          deviceId: sessionData.deviceId,
          sessionId,
        })
        throw req.server.httpErrors.unauthorized('Invalid identity')
      }
      return sessionData
    } catch (error) {
      // Pass HTTP errors through
      const httpError = z.object({ statusCode: z.number() }).safeParse(error)
      if (httpError.success) {
        throw error
      }
      req.log.debug({
        msg: 'Failed to decrypt session',
        error,
        redisKey,
        redisData,
        sessionCipherIndex,
        sessionId,
      })
      sessionCipherIndex++
    }
  }
  req.log.error({
    msg: 'Failed to decrypt session data: exhausted all available session ciphers',
    sessionId,
    redisData,
    sessionCipherIndex,
  })
  throw req.server.httpErrors.unauthorized(unauthorizedMessage)
}

function deriveSessionCipher(
  ikm: Uint8Array,
  sessionId: Uint8Array
): SecretBoxCipher {
  return {
    algorithm: 'secretBox',
    key: new Uint8Array(
      crypto.hkdfSync(
        'sha256',
        ikm,
        new Uint8Array(), // no salt
        sessionId,
        32
      )
    ),
  }
}

// --

export default fp(authPlugin, {
  fastify: '4.x',
  name: 'auth',
  dependencies: ['sodium', 'redis', 'auditLog'],
  decorators: {
    fastify: ['sodium', 'redis'],
    request: ['auditLog'],
  },
})
