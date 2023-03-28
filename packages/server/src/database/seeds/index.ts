import { Sql } from 'postgres'
import { TABLE_NAME as DEVICES_TABLE } from '../models/devices.js'
import { TABLE_NAME as IDENTITY_TABLE } from '../models/identity.js'
import { SEED_USERS } from './identities.js'

export async function apply(sql: Sql) {
  const identities = SEED_USERS.map(user => user.identity)
  const devices = SEED_USERS.map(user => user.device)
  await sql`INSERT INTO ${sql(IDENTITY_TABLE)} ${sql(identities)}`
  await sql`INSERT INTO ${sql(DEVICES_TABLE)}  ${sql(devices)}`
}
