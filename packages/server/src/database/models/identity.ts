import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_identities'

export const identitySchema = z.object({
  userId: z.string(),
  signaturePublicKey: z.string(),
  sharingPublicKey: z.string(),
  proof: z.string(),
})

export type IdentitySchema = z.infer<typeof identitySchema>

export function createIdentity(
  sql: Sql,
  identity: Omit<IdentitySchema, 'createdAt'>
) {
  return sql`INSERT INTO ${sql(TABLE_NAME)} ${sql(identity)}`
}

export async function getIdentity(sql: Sql, userId: string) {
  const result: IdentitySchema[] = await sql`
    SELECT *
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('userId')} = ${userId}
    LIMIT 1
  `
  return getFirst(result)
}

export function getIdentities(sql: Sql, userIds: string[]) {
  return sql<IdentitySchema[]>`
    SELECT *
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('userId')} IN ${sql(userIds)}
  `
}
