import {
  getSharedKeysResponseBody,
  GetSharedKeysResponseBody,
  postSharedKeyBody,
  PostSharedKeyBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getKeychainItem } from '../database/models/keychain.js'
import { getPermission } from '../database/models/permissions.js'
import {
  getKeysSharedByMe,
  getKeysSharedWithMe,
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
      preValidation: app.usePublicKeyAuth(),
      schema: {
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        body: zodToJsonSchema(postSharedKeyBody),
        response: {
          201: {
            type: 'null',
          },
        },
      },
    },
    async function postSharedKey(req, res) {
      // First, check if the recipient doesn't
      // already have this key in their keychain
      const existingKeychainEntry = await getKeychainItem(app.db, {
        ownerId: req.body.toUserId,
        nameFingerprint: req.body.nameFingerprint,
        payloadFingerprint: req.body.payloadFingerprint,
      })
      if (existingKeychainEntry) {
        throw app.httpErrors.conflict(
          'The recipient already has a copy of this key'
        )
      }
      const { allowSharing } = await getPermission(
        app.db,
        req.identity.userId,
        req.body.nameFingerprint
      )
      if (!allowSharing) {
        throw app.httpErrors.forbidden('You are not allowed to share this key')
      }
      await storeSharedKey(app.db, req.body)
      return res.status(201).send()
    }
  )

  app.get<{
    Headers: PublicKeyAuthHeaders
    Reply: GetSharedKeysResponseBody
  }>(
    '/shared-keys/incoming',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSharedKeysResponseBody),
        },
      },
    },
    async function getIncomingSharedKeys(req, res) {
      const sharedKeys = await getKeysSharedWithMe(app.db, req.identity.userId)
      return res.send(sharedKeys)
    }
  )

  app.get<{
    Headers: PublicKeyAuthHeaders
    Reply: GetSharedKeysResponseBody
  }>(
    '/shared-keys/outgoing',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSharedKeysResponseBody),
        },
      },
    },
    async function getOutgoingSharedKeys(req, res) {
      const sharedKeys = await getKeysSharedByMe(app.db, req.identity)
      return res.send(sharedKeys)
    }
  )
}
