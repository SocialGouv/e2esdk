import {
  getMultipleIdentitiesResponseBody,
  GetMultipleIdentitiesResponseBody,
  getSingleIdentityResponseBody,
  GetSingleIdentityResponseBody,
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
} from '@e2esdk/api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getIdentities, getIdentity } from '../database/models/identity.js'
import type { App } from '../types'

const userIdParams = z.object({
  userId: z.string(),
})

const userIdsParams = z.object({
  userIds: z.string(),
})

export default async function identitiesRoutes(app: App) {
  app.get<{
    Params: z.infer<typeof userIdParams>
    Headers: PublicKeyAuthHeaders
    Reply: GetSingleIdentityResponseBody
  }>(
    '/identity/:userId',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        params: zodToJsonSchema(userIdParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getSingleIdentityResponseBody),
        },
      },
    },
    async function getSinglePublicIdentity(req, res) {
      const identity = await getIdentity(app.db, req.params.userId)
      if (!identity) {
        throw app.httpErrors.notFound(
          `No identity found for user id ${req.params.userId}`
        )
      }
      return res.send(identity)
    }
  )
  app.get<{
    Params: z.infer<typeof userIdsParams>
    Reply: GetMultipleIdentitiesResponseBody
  }>(
    '/identities/:userIds',
    {
      preValidation: app.usePublicKeyAuth(),
      schema: {
        params: zodToJsonSchema(userIdsParams),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getMultipleIdentitiesResponseBody),
        },
      },
    },
    async function getMultiplePublicIdentities(req, res) {
      const userIds = req.params.userIds.split(',')
      const identities = await getIdentities(app.db, userIds)
      return res.send(identities)
    }
  )
}
