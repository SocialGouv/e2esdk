import {
  loginResponseBody,
  LoginResponseBody,
  PublicRouteHeaders,
  publicRouteHeaders,
} from '@e2esdk/api'
import { isFarFromCurrentTime } from '@e2esdk/core'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getOwnIdentity } from '../database/models/identity.js'
import type { App } from '../types'

export default async function loginRoutes(app: App) {
  app.get<{
    Headers: PublicRouteHeaders
    Reply: LoginResponseBody
  }>(
    '/login',
    {
      schema: {
        headers: zodToJsonSchema(publicRouteHeaders),
        response: {
          200: zodToJsonSchema(loginResponseBody),
        },
      },
    },
    async function login(req, res) {
      if (isFarFromCurrentTime(req.headers['x-e2esdk-timestamp'])) {
        throw app.httpErrors.forbidden(
          'Request timestamp is too far off current time'
        )
      }
      const identity = await getOwnIdentity(
        app.db,
        req.headers['x-e2esdk-user-id']
      )
      if (!identity) {
        throw app.httpErrors.notFound(
          `No identity found for user id ${req.identity.userId}`
        )
      }
      return res.send(identity)
    }
  )
}
