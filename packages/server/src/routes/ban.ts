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
      preValidation: app.usePublicKeyAuth(),
      schema: {
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
      return res.status(204).send()
    }
  )
}
