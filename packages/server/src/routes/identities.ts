import {
  getMultipleIdentitiesResponseBody,
  GetMultipleIdentitiesResponseBody,
  getSingleIdentityResponseBody,
  GetSingleIdentityResponseBody,
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getIdentities, getIdentity } from '../database/models/identity.js'
import type { App } from '../types'

const userIdParams = z.object({
  userId: z.string(),
})

const userIdsParams = z.object({
  userIds: z
    .string()
    .describe('Coma-separated list of user IDs (eg: `alice,bob`)'),
})

export default async function identitiesRoutes(app: App) {
  app.get<{
    Params: z.infer<typeof userIdParams>
    Headers: PublicKeyAuthHeaders
    Reply: GetSingleIdentityResponseBody
  }>(
    '/identity/:userId',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['identity'],
        summary: 'Get a single user identity',
        params: zodToJsonSchema(userIdParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSingleIdentityResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getSinglePublicIdentity(req, res) {
      const identity = await getIdentity(app.db, req.params.userId)
      if (!identity) {
        req.auditLog.warn({ msg: 'getIdentity:notFound', params: req.params })
        throw app.httpErrors.notFound(
          `No identity found for user id ${req.params.userId}`
        )
      }
      req.auditLog.trace({
        msg: 'getIdentity:success',
        params: req.params,
        identity,
      })
      return res.send(identity)
    }
  )
  app.get<{
    Params: z.infer<typeof userIdsParams>
    Reply: GetMultipleIdentitiesResponseBody
  }>(
    '/identities/:userIds',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['identity'],
        summary: 'Get multiple user identities',
        params: zodToJsonSchema(userIdsParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getMultipleIdentitiesResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getMultiplePublicIdentities(req, res) {
      const userIds = req.params.userIds.split(',')
      const identities = await getIdentities(app.db, userIds)
      req.auditLog.trace({ msg: 'getIdentities:success', userIds, identities })
      return res.send(identities)
    }
  )
}
