import {
  PublicRouteHeaders,
  publicRouteHeaders,
  signupRequestBody,
  SignupRequestBody,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createIdentity } from '../database/models/identity.js'
import { App } from '../types'

export default async function signupRoutes(app: App) {
  app.post<{
    Headers: PublicRouteHeaders
    Body: SignupRequestBody
  }>(
    '/signup',
    {
      preValidation: app.usePublicKeyAuth({
        getIdentity(req) {
          return {
            userId: req.body.userId,
            sharingPublicKey: req.body.sharingPublicKey,
            signaturePublicKey: req.body.signaturePublicKey,
          }
        },
      }),
      schema: {
        headers: zodToJsonSchema(publicRouteHeaders),
        body: zodToJsonSchema(signupRequestBody),
        response: {
          201: {
            type: 'null',
            description: 'Account has been created',
          },
        },
      },
    },
    async function signup(req, res) {
      await createIdentity(app.db, req.body)
      return res.status(201).send()
    }
  )
}
