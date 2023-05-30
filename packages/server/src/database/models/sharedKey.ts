import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'
import type { IdentitySchema } from './identity'

export const TABLE_NAME = 'e2esdk_shared_keys'

export const sharedKeySchema = z.object({
  sharedAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  toUserId: z.string(),
  fromUserId: z.string(),
  fromSharingPublicKey: z.string(),
  fromSignaturePublicKey: z.string(),
  fromProof: z.string(),
  encryptedKeychainName: z.string(),
  encryptedKey: z.string(),
  keychainFingerprint: z.string(),
  keyFingerprint: z.string(),
  signature: z.string(),
})

export type SharedKeySchema = z.infer<typeof sharedKeySchema>

export const sharedKeyInsertsNotificationChannel = `${TABLE_NAME}_insert`

export function storeSharedKey(
  sql: Sql,
  sharedKey: Omit<SharedKeySchema, 'sharedAt'>
) {
  return sql`INSERT INTO ${sql(TABLE_NAME)} ${sql(sharedKey)}`
}

export async function getSharedKey(
  sql: Sql,
  to: string,
  keyFingerprint: string
) {
  const results: SharedKeySchema[] = await sql`
    SELECT *
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('toUserId')} = ${to}
    AND   ${sql('keyFingerprint')} = ${keyFingerprint}
    LIMIT 1
  `
  return getFirst(results)
}

export function getKeysSharedWithMe(
  sql: Sql,
  userId: string
): Promise<SharedKeySchema[]> {
  return sql`
    SELECT *
    FROM ${sql(TABLE_NAME)}
    WHERE ${sql('toUserId')} = ${userId}
    ORDER BY ${sql('sharedAt')} ASC
  `
}

export function getKeysSharedByMe(
  sql: Sql,
  identity: Pick<
    IdentitySchema,
    'userId' | 'sharingPublicKey' | 'signaturePublicKey' | 'proof'
  >
): Promise<SharedKeySchema[]> {
  return sql`
    SELECT *
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('fromUserId')}              = ${identity.userId}
    AND   ${sql('fromSharingPublicKey')}    = ${identity.sharingPublicKey}
    AND   ${sql('fromSignaturePublicKey')}  = ${identity.signaturePublicKey}
    AND   ${sql('fromProof')}               = ${identity.proof}
  `
}

export function deleteSharedKey(
  sql: Sql,
  from: string,
  to: string,
  keyFingerprint: string
) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('fromUserId')}          = ${from}
    AND   ${sql('toUserId')}            = ${to}
    AND   ${sql('keyFingerprint')}  = ${keyFingerprint}
    RETURNING *
  `
}

export function deleteSharedKeysByName(
  sql: Sql,
  to: string,
  keychainFingerprint: string
) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('toUserId')}        = ${to}
    AND   ${sql('keychainFingerprint')} = ${keychainFingerprint}
  `
}
