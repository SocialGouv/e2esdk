import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_keychain_items'

export const keychainItemSchema = z.object({
  addedAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  subkeyIndex: z.number().int(),
  encryptedKeychainName: z.string(),
  encryptedKey: z.string(),
  keychainFingerprint: z.string(),
  keyFingerprint: z.string(),
  ownerId: z.string(),
  sharedBy: z.string().nullable(),
  signature: z.string(),
})

export type KeychainItemSchema = z.infer<typeof keychainItemSchema>

export const keychainUpdatedNotificationChannel = `${TABLE_NAME}_updated`

export function storeKeychainItem(
  sql: Sql,
  item: Omit<KeychainItemSchema, 'addedAt'>
) {
  return sql`INSERT INTO ${sql(TABLE_NAME)} ${sql(item)}`
}

export function getOwnKeychainItems(
  sql: Sql,
  userId: string
): Promise<KeychainItemSchema[]> {
  return sql`
    SELECT *
    FROM ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')} = ${userId}
  `
}

export async function getKeychainItem(
  sql: Sql,
  {
    ownerId,
    keychainFingerprint,
    keyFingerprint,
  }: Pick<
    KeychainItemSchema,
    'ownerId' | 'keychainFingerprint' | 'keyFingerprint'
  >
) {
  const results: KeychainItemSchema[] = await sql`
    SELECT *
    FROM ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')} = ${ownerId}
    -- Keep keyFingerprint first for (theoretical) index performance
    AND ${sql('keyFingerprint')} = ${keyFingerprint}
    AND ${sql('keychainFingerprint')}    = ${keychainFingerprint}
  `
  return getFirst(results)
}

export function getKeyNameParticipants(sql: Sql, keychainFingerprint: string) {
  return sql<KeychainItemSchema[]>`SELECT *
  FROM ${sql(TABLE_NAME)}
  WHERE ${sql('keychainFingerprint')} = ${keychainFingerprint}
  `
}

export function deleteKeychainItem(
  sql: Sql,
  ownerId: string,
  keychainFingerprint: string,
  keyFingerprint: string
) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')}            = ${ownerId}
    AND   ${sql('keyFingerprint')} = ${keyFingerprint}
    AND   ${sql('keychainFingerprint')}    = ${keychainFingerprint}
  `
}

export function deleteKeychainItems(
  sql: Sql,
  ownerId: string,
  keychainFingerprint: string
) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')}         = ${ownerId}
    AND   ${sql('keychainFingerprint')} = ${keychainFingerprint}
  `
}
