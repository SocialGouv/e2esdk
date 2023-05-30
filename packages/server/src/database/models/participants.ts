import { identitySchema, permissionFlags } from '@socialgouv/e2esdk-api'
import { Sql } from 'postgres'
import { z } from 'zod'
import { TABLE_NAME as IDENTITY_TABLE } from './identity.js'
import { TABLE_NAME as KEYCHAIN_TABLE, keychainItemSchema } from './keychain.js'
import { TABLE_NAME as PERMISSIONS_TABLE } from './permissions.js'

const getNamePayloadParticipantsQueryResult = identitySchema
  .merge(permissionFlags.partial())
  .merge(
    keychainItemSchema.pick({
      addedAt: true,
      sharedBy: true,
    })
  )

type GetNamePayloadParticipantsQueryResult = z.infer<
  typeof getNamePayloadParticipantsQueryResult
>

export function getNamePayloadParticipantsWithPermissions(
  sql: Sql,
  keychainFingerprint: string,
  keyFingerprint: string
) {
  return sql<GetNamePayloadParticipantsQueryResult[]>`
    SELECT
      -- Identity
      i.${sql('userId')},
      i.${sql('sharingPublicKey')},
      i.${sql('signaturePublicKey')},
      i.${sql('proof')},
      -- Keychain metadata
      k.${sql('addedAt')},
      k.${sql('sharedBy')},
      -- Permissions
      p.${sql('allowSharing')},
      p.${sql('allowRotation')},
      p.${sql('allowDeletion')},
      p.${sql('allowManagement')}

    -- Joins
    FROM ${sql(KEYCHAIN_TABLE)} AS k
    INNER JOIN ${sql(IDENTITY_TABLE)} AS i
      ON i.${sql('userId')} = k.${sql('ownerId')}
    LEFT JOIN ${sql(PERMISSIONS_TABLE)} AS p
      ON  p.${sql('userId')} = k.${sql('ownerId')}
      AND p.${sql('keychainFingerprint')} = ${keychainFingerprint}

    -- Filter
    WHERE k.${sql('keychainFingerprint')}    = ${keychainFingerprint}
    AND   k.${sql('keyFingerprint')} = ${keyFingerprint}

    -- Sort
    ORDER BY k.${sql('addedAt')} DESC
  `
}
