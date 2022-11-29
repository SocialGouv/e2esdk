import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_keychain_items'

export const keychainItemSchema = z.object({
  addedAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  subkeyIndex: z.number().int(),
  name: z.string(),
  payload: z.string(),
  nameFingerprint: z.string(),
  payloadFingerprint: z.string(),
  ownerId: z.string(),
  sharedBy: z.string().nullable(),
  signature: z.string(),
})

export type KeychainItemSchema = z.infer<typeof keychainItemSchema>

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
    nameFingerprint,
    payloadFingerprint,
  }: Pick<
    KeychainItemSchema,
    'ownerId' | 'nameFingerprint' | 'payloadFingerprint'
  >
) {
  const results: KeychainItemSchema[] = await sql`
    SELECT *
    FROM ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')} = ${ownerId}
    -- Keep payloadFingerprint first for (theoretical) index performance
    AND ${sql('payloadFingerprint')} = ${payloadFingerprint}
    AND ${sql('nameFingerprint')}    = ${nameFingerprint}
  `
  return getFirst(results)
}

export function getKeyNameParticipants(sql: Sql, nameFingerprint: string) {
  return sql<KeychainItemSchema[]>`SELECT *
  FROM ${sql(TABLE_NAME)}
  WHERE ${sql('nameFingerprint')} = ${nameFingerprint}
  `
}

export function deleteKeychainItems(
  sql: Sql,
  ownerId: string,
  nameFingerprint: string
) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('ownerId')}         = ${ownerId}
    AND   ${sql('nameFingerprint')} = ${nameFingerprint}
  `
}
