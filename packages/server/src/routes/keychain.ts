import {
  GetKeychainResponseBody,
  getKeychainResponseBody,
  postKeychainItemRequestBody,
  PostKeychainItemRequestBody,
  requestHeaders,
  RequestHeaders,
} from '@socialgouv/e2esdk-api'
import {
  numberToUint32LE,
  verifyMultipartSignature,
} from '@socialgouv/e2esdk-crypto'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  deleteKeychainItem,
  getKeyNameParticipants,
  getOwnKeychainItems,
  keychainItemSchema,
  storeKeychainItem,
} from '../database/models/keychain.js'
import {
  createPermission,
  getPermission,
} from '../database/models/permissions.js'
import { deleteSharedKey, getSharedKey } from '../database/models/sharedKey.js'
import type { App } from '../types'

export default async function keychainRoutes(app: App) {
  app.post<{
    Headers: RequestHeaders
    Body: PostKeychainItemRequestBody
  }>(
    '/keychain',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['keychain'],
        summary: 'Add a key to my keychain',
        headers: zodToJsonSchema(requestHeaders),
        body: zodToJsonSchema(postKeychainItemRequestBody, {
          $refStrategy: 'none',
        }),
        response: {
          201: {
            type: 'null',
          },
        },
      },
    },
    async function postKeychainItem(req, res) {
      function forbidden(msg: string, extra?: any): never {
        req.auditLog.warn({
          msg: 'postKeychainItem:forbidden',
          details: msg,
          body: req.body,
          extra,
        })
        throw app.httpErrors.forbidden(msg)
      }

      if (req.identity.userId !== req.body.ownerId) {
        forbidden("You cannot add keychain keys that don't belong to you")
      }
      if (
        !verifyMultipartSignature(
          app.sodium,
          app.sodium.from_base64(req.identity.signaturePublicKey),
          app.sodium.from_base64(req.body.signature),
          app.sodium.from_string(req.identity.userId),
          app.sodium.from_string(req.body.sharedBy ?? ''),
          app.sodium.from_string(req.body.createdAt),
          app.sodium.from_string(req.body.expiresAt ?? ''),
          numberToUint32LE(req.body.subkeyIndex),
          app.sodium.from_base64(req.body.nameFingerprint),
          app.sodium.from_base64(req.body.payloadFingerprint)
        )
      ) {
        forbidden('Invalid key signature')
      }

      if (!req.body.sharedBy) {
        const participants = await getKeyNameParticipants(
          app.db,
          req.body.nameFingerprint
        )
        const isKeyAuthor = participants.length === 0
        if (
          !isKeyAuthor &&
          participants.every(
            participant => participant.ownerId !== req.identity.userId
          )
        ) {
          // User is trying to add a key that already has participants,
          // but user themselves are not in it, and they haven't specified
          // where the key came from.
          forbidden('You are not allowed to add this key', {
            participants,
          })
        }
        const { allowRotation } = await getPermission(
          app.db,
          req.identity.userId,
          req.body.nameFingerprint
        )
        const isRotation =
          !isKeyAuthor &&
          participants.every(
            key => key.payloadFingerprint !== req.body.payloadFingerprint
          )
        if (isRotation && !allowRotation) {
          forbidden('You are not allowed to rotate this key', { participants })
        }
        // Note: rotating back to an old key is prevented by the use of
        // a compound primary key encompassing (userId, payload_fingerprint).
        await app.db.begin(async tx => {
          if (isKeyAuthor) {
            await createPermission(tx, {
              userId: req.identity.userId,
              nameFingerprint: req.body.nameFingerprint,
              allowManagement: true,
              allowRotation: true,
              allowDeletion: true,
              allowSharing: true,
            })
          }
          await storeKeychainItem(tx, req.body)
        })
        req.auditLog.info({
          msg: 'postKeychainItem:success',
          body: req.body,
          isAuthor: true,
        })
        app.webhook.notifyKeyAdded(req, {
          createdAt: req.body.createdAt,
          expiresAt: req.body.expiresAt,
          nameFingerprint: req.body.nameFingerprint,
          payloadFingerprint: req.body.payloadFingerprint,
          ownerId: req.body.ownerId,
          sharedBy: req.body.sharedBy,
          subkeyIndex: req.body.subkeyIndex,
          signature: req.body.signature,
        })
        return res.status(201).send()
      }

      // If the origin of the key is specified,
      // make sure it matches a shared key entry.

      const sharedKey = await getSharedKey(
        app.db,
        req.identity.userId,
        req.body.payloadFingerprint
      )
      if (!sharedKey) {
        forbidden('Could not find associated shared key')
      }
      if (req.body.sharedBy !== sharedKey.fromUserId) {
        forbidden('Mismatching shared key origin')
      }
      for (const fieldToMatch of [
        'createdAt',
        'expiresAt',
        'nameFingerprint',
        'payloadFingerprint',
      ] as const) {
        if (sharedKey[fieldToMatch] !== req.body[fieldToMatch]) {
          forbidden(`Mismatching field ${fieldToMatch} with shared key`, {
            sharedKey,
          })
        }
      }
      await app.db.begin(
        async function storeKeychainItemAndDeleteSharedKeyTransaction(tx) {
          await storeKeychainItem(tx, req.body)
          await deleteSharedKey(
            tx,
            req.body.sharedBy!,
            req.identity.userId,
            req.body.payloadFingerprint
          )
        }
      )
      req.auditLog.info({
        msg: 'postKeychainItem:success',
        body: req.body,
        isAuthor: false,
        sharedKey,
      })
      app.webhook.notifyKeyAdded(req, {
        createdAt: req.body.createdAt,
        expiresAt: req.body.expiresAt,
        nameFingerprint: req.body.nameFingerprint,
        payloadFingerprint: req.body.payloadFingerprint,
        ownerId: req.body.ownerId,
        sharedBy: req.body.sharedBy,
        subkeyIndex: req.body.subkeyIndex,
        signature: req.body.signature,
      })
      return res.status(201).send()
    }
  )

  app.get<{
    Headers: RequestHeaders
    Reply: GetKeychainResponseBody
  }>(
    '/keychain',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['keychain'],
        summary: 'Get my own keys',
        headers: zodToJsonSchema(requestHeaders),
        response: {
          200: zodToJsonSchema(getKeychainResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getKeychain(req, res) {
      const items = await getOwnKeychainItems(app.db, req.identity.userId)
      req.auditLog.trace({ msg: 'getKeychain:success', items })
      return res.send(items)
    }
  )

  const deleteKeychainEntryURLParams = keychainItemSchema.pick({
    nameFingerprint: true,
    payloadFingerprint: true,
  })

  app.delete<{
    Headers: RequestHeaders
    Params: z.infer<typeof deleteKeychainEntryURLParams>
  }>(
    '/keychain/:nameFingerprint/:payloadFingerprint',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['keychain'],
        summary: 'Delete a keychain entry',
        params: zodToJsonSchema(deleteKeychainEntryURLParams),
        headers: zodToJsonSchema(requestHeaders),
        response: {
          200: {
            type: 'null',
          },
        },
      },
    },
    async function deleteKeychainItemEndpoint(req, res) {
      await deleteKeychainItem(
        app.db,
        req.identity.userId,
        req.params.nameFingerprint,
        req.params.payloadFingerprint
      )
      req.auditLog.trace({
        msg: 'deleteKeychainItem:success',
        params: req.params,
      })
      return res.send()
    }
  )
}
