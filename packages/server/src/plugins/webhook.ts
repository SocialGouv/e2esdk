import {
  Identity,
  PostKeychainItemRequestBody,
  PostSharedKeyBody,
  WebhookRoutes,
} from '@socialgouv/e2esdk-api'
import { signAuth } from '@socialgouv/e2esdk-crypto'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from 'process'
import type { App } from '../types'

// Don't bother sending end-to-end encrypted fields in webhook payloads,
// as they can't be decrypted by the application server anyway.
type EncryptedFields = 'encryptedKeychainName' | 'encryptedKey'

type Decoration = {
  // Authorization --

  /**
   * Allow/deny a user to create an account on the e2esdk server.
   *
   * @path {WEBHOOK_URL}/authorize/signup
   *
   * This webhook will ask the application server whether signup is
   * allowed. This could be connected to a check for an existing
   * application-side user record with a matching user ID, to
   * prevent spam (signup being an unauthenticated operation on e2esdk).
   * Alternatively, private invitations and cohorts could be implemented
   * using this technique.
   *
   * A response status code of 200 allows the signup, anything else will deny
   * the signup request.
   */
  authorizeSignup(req: FastifyRequest): Promise<boolean>

  /**
   * Allow/deny a user to share a key with someone else.
   *
   * @path {WEBHOOK_URL}/authorize/key-share
   *
   * This allows the application server to perform some logic to allow
   * or deny sharing, based on application-specific information it might have.
   */
  authorizeKeyShare(
    req: FastifyRequest,
    sharedKey: PostSharedKeyBody
  ): Promise<boolean>

  // Notifications --

  /**
   * Notify the app server that a user has successfully created their
   * cryptographic identity on the e2esdk server.
   *
   * @path {WEBHOOK_URL}/notify/signup
   *
   * This may be useful to implement invites systems, where the application
   * must put some business logic on hold until the recipient of the invite
   * has finished onboarding.
   *
   * Once a client has completed signup, keys can be shared with them to
   * complete the invitation process.
   */
  notifySignup(req: FastifyRequest, identity: Identity): void

  /**
   * Notify the app server that a user has created a new key or accepted
   * a shared key.
   *
   * @path {WEBHOOK_URL}/notify/key-added
   */
  notifyKeyAdded(
    req: FastifyRequest,
    item: Omit<PostKeychainItemRequestBody, EncryptedFields>
  ): void

  /**
   * Notify the app server that a user has started sharing a key.
   * Note that at this time, the key may not have been accepted by the recipient
   * yet. When they do, the `notifyKeyAdded` webhook will be fired.
   *
   * @path {WEBHOOK_URL}/notify/key-shared
   */
  notifyKeyShared(
    req: FastifyRequest,
    item: Omit<PostSharedKeyBody, EncryptedFields>
  ): void
}

declare module 'fastify' {
  interface FastifyInstance {
    webhook: Decoration
  }
}

// --

type WebhookPaths = keyof WebhookRoutes

type WebhookAPICallArgs<Path extends WebhookPaths> = {
  name: keyof Decoration
  req: FastifyRequest
  path: Path
  body: WebhookRoutes[Path]['body']
}

// --

const webhookPlugin: FastifyPluginAsync = async (app: App) => {
  const baseURL = env.WEBHOOK_URL
  if (!baseURL) {
    app.decorate<Decoration>('webhook', {
      authorizeSignup() {
        return Promise.resolve(true)
      },
      authorizeKeyShare() {
        return Promise.resolve(true)
      },
      notifySignup() {},
      notifyKeyAdded() {},
      notifyKeyShared() {},
    })
    return
  }
  app.log.info({ msg: 'Setting up webhook', url: baseURL })

  async function webhookApiCall<Path extends WebhookPaths>({
    req,
    path,
    name,
    body: payload,
  }: WebhookAPICallArgs<Path>) {
    try {
      const method = 'POST'
      const url = baseURL + path
      const timestamp = new Date().toISOString()
      const userId = encodeURIComponent(req.identity.userId)
      const body = payload ? JSON.stringify(payload) : undefined
      const referrer =
        typeof req.headers.referrer === 'string'
          ? req.headers.referrer
          : undefined
      const signature = signAuth(
        app.sodium,
        app.sodium.from_base64(env.SIGNATURE_PRIVATE_KEY),
        {
          deviceId: req.deviceId,
          sessionId: req.sessionId,
          clientId: req.clientId,
          method,
          userId,
          url,
          timestamp,
          body,
          recipientPublicKey: 'none',
        }
      )
      req.auditLog.trace({
        msg: `webhook:${name}:fetch:request`,
        method,
        url,
        referrer,
        timestamp,
        signature,
        body,
      })
      const response = await fetch(url, {
        method,
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrer,
        body,
        headers: {
          'content-type': 'application/json',
          origin: env.DEPLOYMENT_URL,
          'user-agent': `${app.pkg.name}@${app.pkg.version} Webhook`,
          'x-e2esdk-user-id': userId,
          'x-e2esdk-request-id': req.id,
          'x-e2esdk-client-id': req.clientId,
          'x-e2esdk-device-id': req.deviceId,
          'x-e2esdk-session-id': req.sessionId,
          'x-e2esdk-timestamp': timestamp,
          'x-e2esdk-signature': signature,
          'x-e2esdk-server-pubkey': env.SIGNATURE_PUBLIC_KEY,
        },
      })
      req.auditLog.trace({
        msg: `webhook:${name}:fetch:response`,
        status: response.status,
      })
      return response
    } catch (error) {
      req.auditLog.trace({
        msg: `webhook:${name}:error`,
        error,
      })
      return null
    }
  }

  app.decorate<Decoration>('webhook', {
    async authorizeSignup(req) {
      const userId = encodeURIComponent(req.identity.userId)
      const response = await webhookApiCall({
        req,
        name: 'authorizeSignup',
        path: '/authorize/signup',
        body: {
          userId,
        },
      })
      return response?.status === 200
    },
    async authorizeKeyShare(req, sharedKey) {
      const response = await webhookApiCall({
        req,
        name: 'authorizeKeyShare',
        path: '/authorize/key-share',
        body: sharedKey,
      })
      return response?.status === 200
    },
    notifySignup(req, identity) {
      webhookApiCall({
        req,
        name: 'notifySignup',
        path: '/notify/signup',
        body: identity,
      })
    },
    notifyKeyAdded(req, item) {
      webhookApiCall({
        req,
        name: 'notifyKeyAdded',
        path: '/notify/key-added',
        body: item,
      })
    },
    notifyKeyShared(req, item) {
      webhookApiCall({
        req,
        name: 'notifyKeyShared',
        path: '/notify/key-shared',
        body: item,
      })
    },
  })
}

export default fp(webhookPlugin, {
  fastify: '4.x',
  name: 'webhook',
  dependencies: ['pkg'],
  decorators: {
    fastify: ['pkg'],
  },
})
