import {
  fingerprintSchema,
  getSharedKeysResponseBody,
  GetSharedKeysResponseBody,
  identitySchema,
  postSharedKeyBody,
  PostSharedKeyBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getKeychainItem } from '../database/models/keychain.js'
import { getPermission } from '../database/models/permissions.js'
import {
  deleteSharedKey,
  getKeysSharedByMe,
  getKeysSharedWithMe,
  getSharedKey,
  storeSharedKey,
} from '../database/models/sharedKey.js'
import type { App } from '../types'

export default async function sharedKeysRoutes(app: App) {
  app.post<{
    Headers: PublicKeyAuthHeaders
    Body: PostSharedKeyBody
  }>(
    '/shared-keys',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['sharedKeys'],
        summary: 'Share a key with someone',
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        body: zodToJsonSchema(postSharedKeyBody, { $refStrategy: 'none' }),
        response: {
          201: {
            type: 'null',
          },
        },
      },
    },
    async function postSharedKey(req, res) {
      if (
        req.identity.userId !== req.body.fromUserId ||
        req.identity.sharingPublicKey !== req.body.fromSharingPublicKey ||
        req.identity.signaturePublicKey !== req.body.fromSignaturePublicKey
      ) {
        const reason = 'You are not allowed to share keys as someone else'
        req.auditLog.warn({
          msg: 'postSharedKey:forbidden',
          reason,
          body: req.body,
        })
        throw app.httpErrors.forbidden(reason)
      }
      // First, check if the recipient doesn't
      // already have this key in their keychain
      const existingKeychainEntry = await getKeychainItem(app.db, {
        ownerId: req.body.toUserId,
        nameFingerprint: req.body.nameFingerprint,
        payloadFingerprint: req.body.payloadFingerprint,
      })
      const conflictMessage = 'The recipient already has a copy of this key'
      if (existingKeychainEntry) {
        req.auditLog.warn({
          msg: 'postSharedKey:conflict',
          reason: conflictMessage,
          body: req.body,
          existingKeychainEntry,
        })
        throw app.httpErrors.conflict(conflictMessage)
      }
      // Then, check if there is already a pending shared key
      const existingSharedKey = await getSharedKey(
        app.db,
        req.body.toUserId,
        req.body.payloadFingerprint
      )
      if (existingSharedKey) {
        // We use the same message as the previous check
        // to avoid revealing too much to a potential attacker.
        req.auditLog.warn({
          msg: 'postSharedKey:conflict',
          reason: conflictMessage,
          body: req.body,
          existingSharedKey,
        })
        throw app.httpErrors.conflict(conflictMessage)
      }
      // Then, are we allowed to share this key?
      const { allowSharing } = await getPermission(
        app.db,
        req.identity.userId,
        req.body.nameFingerprint
      )
      if (!allowSharing) {
        const reason = 'You are not allowed to share this key'
        req.auditLog.warn({
          msg: 'postSharedKey:forbidden',
          reason,
          details: 'disallowed by permissions',
          body: req.body,
        })
        throw app.httpErrors.forbidden(reason)
      }
      // Finally, ask the application server through a webhook
      if (!(await app.webhook.authorizeKeyShare(req, req.body))) {
        const reason = 'You are not allowed to share this key'
        req.auditLog.warn({
          msg: 'postSharedKey:forbidden',
          reason,
          details: 'disallowed by webhook',
          body: req.body,
        })
        throw app.httpErrors.forbidden(reason)
      }
      await storeSharedKey(app.db, req.body)
      req.auditLog.info({ msg: 'postSharedKey:success', body: req.body })
      app.webhook.notifyKeyShared(req, req.body)
      return res.status(201).send()
    }
  )

  app.get<{
    Headers: PublicKeyAuthHeaders
    Reply: GetSharedKeysResponseBody
  }>(
    '/shared-keys/incoming',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['sharedKeys'],
        summary: 'List incoming keys shared with me',
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSharedKeysResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getIncomingSharedKeys(req, res) {
      const sharedKeys = await getKeysSharedWithMe(app.db, req.identity.userId)
      req.auditLog.trace({ msg: 'getIncomingSharedKeys:success', sharedKeys })
      return res.send(sharedKeys)
    }
  )

  app.get<{
    Headers: PublicKeyAuthHeaders
    Reply: GetSharedKeysResponseBody
  }>(
    '/shared-keys/outgoing',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['sharedKeys'],
        summary: 'List keys I have shared with others',
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSharedKeysResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getOutgoingSharedKeys(req, res) {
      const sharedKeys = await getKeysSharedByMe(app.db, req.identity)
      req.auditLog.trace({ msg: 'getOutgoingSharedKeys:success', sharedKeys })
      return res.send(sharedKeys)
    }
  )

  const deleteSharedKeyUrlParams = z.object({
    userId: identitySchema.shape.userId,
    payloadFingerprint: fingerprintSchema,
  })

  app.delete<{
    Params: z.infer<typeof deleteSharedKeyUrlParams>
    Headers: PublicKeyAuthHeaders
  }>(
    '/shared-keys/:userId/:payloadFingerprint',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['sharedKeys'],
        summary: 'Remove a shared key',
        params: zodToJsonSchema(deleteSharedKeyUrlParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: {
            type: 'null',
          },
        },
      },
    },
    async function deletePendingSharedKey(req, res) {
      const [deleted] = await deleteSharedKey(
        app.db,
        req.identity.userId,
        req.params.userId,
        req.params.payloadFingerprint
      )
      req.auditLog.info({
        msg: 'deletePendingSharedKey:success',
        params: req.params,
        deleted,
      })
      return res.send()
    }
  )
}
