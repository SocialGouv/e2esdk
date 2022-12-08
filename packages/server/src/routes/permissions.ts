import {
  fingerprintSchema,
  permissionFlags,
  PermissionFlags,
  postPermissionRequestBody,
  PostPermissionRequestBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@e2esdk/api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  getPermission,
  updatePermission,
} from '../database/models/permissions.js'
import type { App } from '../types'

export default async function permissionsRoutes(app: App) {
  const getPermissionsUrlParams = z.object({
    nameFingerprint: fingerprintSchema,
  })
  type GetPermissionsUrlParams = z.infer<typeof getPermissionsUrlParams>

  app.get<{
    Params: GetPermissionsUrlParams
    Headers: PublicKeyAuthHeaders
    Reply: PermissionFlags
  }>(
    '/permissions/:nameFingerprint',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        tags: ['permissions'],
        summary: 'Get permissions for a namespace',
        params: zodToJsonSchema(getPermissionsUrlParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(permissionFlags),
        },
      },
    },
    async function getPermissions(req, res) {
      const flags = await getPermission(
        app.db,
        req.identity.userId,
        req.params.nameFingerprint
      )
      req.log.debug({
        msg: 'retrieved permissions from database',
        nameFingerprint: req.params.nameFingerprint,
        identity: req.identity,
        flags,
      })
      return res.send(flags)
    }
  )

  app.post<{
    Headers: PublicKeyAuthHeaders
    Body: PostPermissionRequestBody
  }>(
    '/permissions',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        tags: ['permissions'],
        summary: 'Update permissions for a user & namespace',
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
