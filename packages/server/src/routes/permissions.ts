import {
  postPermissionRequestBody,
  PostPermissionRequestBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  getPermission,
  updatePermission,
} from '../database/models/permissions.js'
import type { App } from '../types'

export default async function permissionsRoutes(app: App) {
  app.post<{
    Headers: PublicKeyAuthHeaders
    Body: PostPermissionRequestBody
  }>(
    '/permissions',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        body: zodToJsonSchema(postPermissionRequestBody),
        response: {
          204: {
            type: 'null',
          },
        },
      },
    },
    async function postPermission(req, res) {
      const { allowManagement } = await getPermission(
        app.db,
        req.identity.userId,
        req.body.nameFingerprint
      )
      if (!allowManagement) {
        throw app.httpErrors.forbidden(
          'You are not allowed to manage permissions for this key'
        )
      }
      if (
        req.body.allowSharing === undefined &&
        req.body.allowRotation === undefined &&
        req.body.allowDeletion === undefined &&
        req.body.allowManagement === undefined
      ) {
        // Nothing to do really..
        throw app.httpErrors.badRequest(
          'At least one permission flag must be set'
        )
      }
      await updatePermission(app.db, req.body)
      return res.status(204).send()
    }
  )
}
