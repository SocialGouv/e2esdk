import {
  fingerprintSchema,
  getParticipantsResponseBody,
  GetParticipantsResponseBody,
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getNamePayloadParticipantsWithPermissions } from '../database/models/participants.js'
import type { App } from '../types'

const getParticipantsUrlParams = z.object({
  nameFingerprint: fingerprintSchema,
  payloadFingerprint: fingerprintSchema,
})

export default async function participantsRoutes(app: App) {
  app.get<{
    Params: z.infer<typeof getParticipantsUrlParams>
    Headers: PublicKeyAuthHeaders
    Reply: GetParticipantsResponseBody
  }>(
    '/participants/:nameFingerprint/:payloadFingerprint',
    {
      preHandler: app.usePublicKeyAuth(),
      schema: {
        tags: ['identity', 'permissions'],
        summary: 'List who has access to a key',
        params: zodToJsonSchema(getParticipantsUrlParams, {
          $refStrategy: 'none',
        }),
        headers: zodToJsonSchema(publicKeyAuthHeaders),
        response: {
          200: zodToJsonSchema(getParticipantsResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getNamePayloadParticipants(req, res) {
      const participants = await getNamePayloadParticipantsWithPermissions(
        app.db,
        req.params.nameFingerprint,
        req.params.payloadFingerprint
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
          msg: 'getNamePayloadParticipants:forbidden',
          params: req.params,
          participants,
        })
        throw app.httpErrors.forbidden(
          'You are not allowed to list participants for this key'
        )
      }
      req.auditLog.trace({
        msg: 'getNamePayloadParticipants:success',
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
