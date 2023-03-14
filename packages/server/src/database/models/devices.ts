import { base64Bytes } from '@socialgouv/e2esdk-api'
import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_devices'

export const deviceSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  enrolledFrom: z.string().uuid().nullable(),
  ownerId: z.string(),
  label: z.string().nullable(),
  wrappedMainKey: z.string(),
  opaqueCredentials: base64Bytes(192),
})

type DeviceSchema = z.infer<typeof deviceSchema>

export async function createDevice(
  sql: Sql,
  device: Omit<DeviceSchema, 'id' | 'createdAt'>
) {
  const result: DeviceSchema[] = await sql`
    INSERT INTO ${sql(TABLE_NAME)} ${sql(device)} RETURNING *
  `
  return getFirst(result)
}

export async function getUserDevice(
  sql: Sql,
  userId: string,
  deviceId: string
) {
  const result: DeviceSchema[] = await sql`
    SELECT *
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('id')}      = ${deviceId}
    AND   ${sql('ownerId')} = ${userId}
    LIMIT 1
  `
  return getFirst(result)
}

export function getUserDevices(sql: Sql, userId: string) {
  return sql<DeviceSchema[]>`
    SELECT *
    FROM     ${sql(TABLE_NAME)}
    WHERE    ${sql('ownerId')} = ${userId}
    ORDER BY ${sql('createdAt')} ASC
  `
}

export function deleteUserDevice(sql: Sql, userId: string, deviceId: string) {
  return sql`
    DELETE
    FROM  ${sql(TABLE_NAME)}
    WHERE ${sql('deviceId')} = ${deviceId}
    AND   ${sql('ownerId')}  = ${userId}
  `
}
