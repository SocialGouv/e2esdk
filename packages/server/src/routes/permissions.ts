import {
  fingerprintSchema,
  permissionFlags,
  PermissionFlags,
  postPermissionRequestBody,
  PostPermissionRequestBody,
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
} from '@socialgouv/e2esdk-api'
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
      preHandler: app.usePublicKeyAuth(),
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
      req.auditLog.trace({
        msg: 'getPermissions:success',
        params: req.params,
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
      preHandler: app.usePublicKeyAuth(),
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
        req.auditLog.warn({ msg: 'postPermission:forbidden', body: req.body })
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
        const reason = 'At least one permission flag must be set'
        req.auditLog.warn({
          msg: 'postPermission:badRequest',
          body: req.body,
          reason,
        })
        throw app.httpErrors.badRequest(reason)
      }
      await updatePermission(app.db, req.body)
      // todo: Add before/after in audit log
      req.auditLog.info({ msg: 'postPermission:success', body: req.body })
      return res.status(204).send()
    }
  )
}
