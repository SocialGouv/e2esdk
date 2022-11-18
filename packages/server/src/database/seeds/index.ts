import { Sql } from 'postgres'
import { TABLE_NAME as IDENTITY_TABLE } from '../models/identity.js'
import { SEED_USERS } from './identities.js'

export async function apply(sql: Sql) {
  const identities = SEED_USERS.map(user => user.identity)
  await sql`INSERT INTO ${sql(IDENTITY_TABLE)} ${sql(identities)}`
}
