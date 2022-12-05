import {
  PublicRouteHeaders,
  publicRouteHeaders,
  signupBody,
  SignupBody,
} from '@e2esdk/api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createIdentity } from '../database/models/identity.js'
import { App } from '../types'

export default async function signupRoutes(app: App) {
  app.post<{
    Headers: PublicRouteHeaders
    Body: SignupBody
    Reply: SignupBody
  }>(
    '/signup',
    {
      preValidation: app.usePublicKeyAuth({
        getIdentity(req) {
          return {
            userId: req.body.userId,
            sharingPublicKey: req.body.sharingPublicKey,
            signaturePublicKey: req.body.signaturePublicKey,
            proof: req.body.proof,
          }
        },
      }),
      schema: {
        headers: zodToJsonSchema(publicRouteHeaders),
        body: zodToJsonSchema(signupBody),
        response: {
          201: zodToJsonSchema(signupBody),
        },
      },
    },
    async function signup(req, res) {
      // todo: Handle insert conflicts and return 409
      await createIdentity(app.db, req.body)
      return res.status(201).send(req.body)
    }
  )
}
