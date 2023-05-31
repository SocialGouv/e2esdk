import {
  fingerprintSchema,
  getParticipantsResponseBody,
  GetParticipantsResponseBody,
  requestHeaders,
  RequestHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getParticipantsWithPermissions } from '../database/models/participants.js'
import type { App } from '../types'

const getParticipantsUrlParams = z.object({
  keychainFingerprint: fingerprintSchema,
  keyFingerprint: fingerprintSchema,
})

export default async function participantsRoutes(app: App) {
  app.get<{
    Params: z.infer<typeof getParticipantsUrlParams>
    Headers: RequestHeaders
    Reply: GetParticipantsResponseBody
  }>(
    '/participants/:keychainFingerprint/:keyFingerprint',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['identity', 'permissions'],
        summary: 'List who has access to a key',
        params: zodToJsonSchema(getParticipantsUrlParams, {
          $refStrategy: 'none',
        }),
        headers: zodToJsonSchema(requestHeaders),
        response: {
          200: zodToJsonSchema(getParticipantsResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getParticipants(req, res) {
      const participants = await getParticipantsWithPermissions(
        app.db,
        req.params.keychainFingerprint,
        req.params.keyFingerprint
      )
      if (
        !participants.some(
          p =>
            p.userId === req.identity.userId &&
            p.sharingPublicKey === req.identity.sharingPublicKey &&
            p.signaturePublicKey === req.identity.signaturePublicKey &&
            p.proof === req.identity.proof
        )
      ) {
        // We're not in the list of participants
        req.auditLog.warn({
          msg: 'getParticipants:forbidden',
          params: req.params,
          participants,
        })
        throw app.httpErrors.forbidden(
          'You are not allowed to list participants for this key'
        )
      }
      req.auditLog.trace({
        msg: 'getParticipants:success',
        params: req.params,
        participants,
      })
      return res.send(
        participants.map(participant => ({
          ...participant,
          allowSharing: Boolean(participant.allowSharing),
          allowRotation: Boolean(participant.allowRotation),
          allowDeletion: Boolean(participant.allowDeletion),
          allowManagement: Boolean(participant.allowManagement),
        }))
      )
    }
  )
}
