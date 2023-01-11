import {
  PublicKeyAuthHeaders,
  publicKeyAuthHeaders,
  signupBody,
  SignupBody,
} from '@socialgouv/e2esdk-api'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createIdentity } from '../database/models/identity.js'
import { env } from '../env.js'
import { App } from '../types'

export default async function authRoutes(app: App) {
  const bodySchema = zodToJsonSchema(signupBody, { $refStrategy: 'none' })
  app.post<{
    Headers: PublicKeyAuthHeaders
    Body: SignupBody
    Reply: SignupBody
  }>(
    '/signup',
    {
      preHandler: app.usePublicKeyAuth({
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
        tags: ['identity'],
        summary: 'Create a new user identity',
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        body: bodySchema,
        response: {
          201: bodySchema,
        },
      },
    },
    async function signup(req, res) {
      if (env.DISABLE_SIGNUP) {
        const reason = 'Signup is not allowed on this server'
        req.auditLog.warn({ msg: 'signup:forbidden', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      if (!(await app.webhook.authorizeSignup(req))) {
        const reason = 'Signup not allowed by application server'
        req.auditLog.warn({ msg: 'signup:forbidden', body: req.body, reason })
        throw app.httpErrors.forbidden(reason)
      }
      try {
        await createIdentity(app.db, req.body)
      } catch {
        req.auditLog.warn({ msg: 'signup:conflict', body: req.body })
        throw app.httpErrors.conflict('This account was already registered')
      }
      app.webhook.notifySignup(req, req.body)
      req.auditLog.info({ msg: 'signup:success', body: req.body })
      return res.status(201).send(req.body)
    }
  )
}
