import {
  postBanRequestBody,
  PostBanRequestBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { deleteKeychainItems } from '../database/models/keychain.js'
import {
  deletePermission,
  getPermission,
} from '../database/models/permissions.js'
import { deleteSharedKeysByName } from '../database/models/sharedKey.js'
import type { App } from '../types'

export default async function banRoutes(app: App) {
  app.post<{
    Headers: PublicKeyAuthHeaders
    Body: PostBanRequestBody
  }>(
    '/ban',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['permissions', 'sharedKeys', 'keychain'],
        summary: 'Remove access to a namespace',
        description:
          'This will remove any pending shared keys, owned keychain items and associated permissions.',
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        body: zodToJsonSchema(postBanRequestBody),
        response: {
          204: {
            type: 'null',
          },
        },
      },
    },
    async function postBan(req, res) {
      // Always allow self-ban
      if (req.body.userId !== req.identity.userId) {
        const { allowDeletion } = await getPermission(
          app.db,
          req.identity.userId,
          req.body.nameFingerprint
        )
        if (!allowDeletion) {
          req.auditLog.warn({ msg: 'ban:forbidden', body: req.body })
          throw app.httpErrors.forbidden(
            'You are not allowed to ban members for this key'
          )
        }
      }
      await app.db.begin(tx => [
        deletePermission(tx, req.body.userId, req.body.nameFingerprint),
        deleteKeychainItems(tx, req.body.userId, req.body.nameFingerprint),
        deleteSharedKeysByName(tx, req.body.userId, req.body.nameFingerprint),
      ])
      req.auditLog.info({ msg: 'ban:success', body: req.body })
      return res.status(204).send()
    }
  )
}
