import {
  fingerprintSchema,
  getParticipantsResponseBody,
  GetParticipantsResponseBody,
  publicKeyAuthHeaders,
  PublicKeyAuthHeaders,
} from '@e2esdk/api'
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
      preValidation: app.usePublicKeyAuth(),
      schema: {
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
      if (getParticipantsUrlParams.safeParse(req.params).success === false) {
        req.log.warn({
          _: 'Invalid request parameters',
          params: req.params,
        })
        throw app.httpErrors.badRequest('Invalid request parameters')
      }
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
        throw app.httpErrors.forbidden(
          'You are not allowed to list participants for this key'
        )
      }
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
