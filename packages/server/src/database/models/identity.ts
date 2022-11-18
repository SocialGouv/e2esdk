import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_identities'

export const identitySchema = z.object({
  userId: z.string(),
  signaturePublicKey: z.string(),
  signaturePrivateKey: z.string(),
  sharingPublicKey: z.string(),
  sharingPrivateKey: z.string(),
})

export type IdentitySchema = z.infer<typeof identitySchema>

export function createIdentity(
  sql: Sql,
  identity: Omit<IdentitySchema, 'createdAt'>
) {
  return sql`INSERT INTO ${sql(TABLE_NAME)} ${sql(identity)}`
}

export async function getOwnIdentity(sql: Sql, userId: string) {
  const columns = [
    'sharingPublicKey',
    'sharingPrivateKey',
    'signaturePublicKey',
    'signaturePrivateKey',
  ] as const
  type Row = Pick<IdentitySchema, typeof columns[number]>
  const result: Row[] = await sql`
    SELECT ${sql(columns)}
    FROM ${sql(TABLE_NAME)}
    WHERE user_id = ${userId}
    LIMIT 1
  `
  return getFirst(result)
}

export async function getPublicIdentity(sql: Sql, userId: string) {
  const columns = ['userId', 'sharingPublicKey', 'signaturePublicKey'] as const
  type Row = Pick<IdentitySchema, typeof columns[number]>
  const result: Row[] = await sql`
    SELECT ${sql(columns)}
    FROM ${sql(TABLE_NAME)}
    WHERE user_id = ${userId}
    LIMIT 1
  `
  return getFirst(result)
}

export function getPublicIdentities(sql: Sql, userIds: string[]) {
  const columns = ['userId', 'sharingPublicKey', 'signaturePublicKey'] as const
  type Row = Pick<IdentitySchema, typeof columns[number]>
  return sql<Row[]>`
    SELECT ${sql(columns)}
    FROM ${sql(TABLE_NAME)}
    WHERE user_id IN ${sql(userIds)}
  `
}
