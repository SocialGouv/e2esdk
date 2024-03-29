import {
  postBanRequestBody,
  PostBanRequestBody,
  requestHeaders,
  RequestHeaders,
} from '@socialgouv/e2esdk-api'
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
    Headers: RequestHeaders
    Body: PostBanRequestBody
  }>(
    '/ban',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['permissions', 'sharedKeys', 'keychain'],
        summary: 'Remove access to a keychain',
        description:
          'This will remove any pending shared keys, owned keychain items and associated permissions.',
        headers: zodToJsonSchema(requestHeaders),
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
          req.body.keychainFingerprint
        )
        if (!allowDeletion) {
          req.auditLog.warn({ msg: 'ban:forbidden', body: req.body })
          throw app.httpErrors.forbidden(
            'You are not allowed to ban members of this keychain'
          )
        }
      }
      // todo: Return deleted objects and record them
      // in the audit log for traceability and recovery.
      await app.db.begin(tx => [
        deletePermission(tx, req.body.userId, req.body.keychainFingerprint),
        deleteKeychainItems(tx, req.body.userId, req.body.keychainFingerprint),
        deleteSharedKeysByName(
          tx,
          req.body.userId,
          req.body.keychainFingerprint
        ),
      ])
      req.auditLog.info({ msg: 'ban:success', body: req.body })
      return res.status(204).send()
    }
  )
}
