import type { Optional } from '@e2esdk/api'
import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_permissions'

export const permissionSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  userId: z.string(),
  nameFingerprint: z.string(),
  allowSharing: z.boolean(),
  allowRotation: z.boolean(),
  allowDeletion: z.boolean(),
  allowManagement: z.boolean(),
})

export type PermissionSchema = z.infer<typeof permissionSchema>

// --

const permissionFlags = permissionSchema.pick({
  allowSharing: true,
  allowRotation: true,
  allowDeletion: true,
  allowManagement: true,
})

type PermissionFlags = z.infer<typeof permissionFlags>

// --

export function createPermission(
  sql: Sql,
  item: Omit<PermissionSchema, 'createdAt' | 'updatedAt'>
) {
  const input: Optional<PermissionSchema, 'createdAt' | 'updatedAt'> = item
  delete input.createdAt
  delete input.updatedAt
  return sql`INSERT INTO ${sql(TABLE_NAME)} ${sql(input)}`
}

export async function getPermission(
  sql: Sql,
  userId: string,
  nameFingerprint: string
): Promise<PermissionFlags> {
  const results: PermissionFlags[] = await sql`
    SELECT ${sql(permissionFlags.keyof().options)}
    FROM   ${sql(TABLE_NAME)}
    WHERE  ${sql('userId')}          = ${userId}
    AND    ${sql('nameFingerprint')} = ${nameFingerprint}
  `
  const result = getFirst(results)
  return (
    result ?? {
      allowDeletion: false,
      allowManagement: false,
      allowRotation: false,
      allowSharing: false,
    }
  )
}

export function updatePermission(
  sql: Sql,
  {
    userId,
    nameFingerprint,
    allowSharing,
    allowRotation,
    allowDeletion,
    allowManagement,
  }: Pick<PermissionSchema, 'userId' | 'nameFingerprint'> &
    Partial<PermissionFlags>
) {
  const insert = {
    userId,
    nameFingerprint,
    allowDeletion: allowDeletion ?? false,
    allowManagement: allowManagement ?? false,
    allowRotation: allowRotation ?? false,
    allowSharing: allowSharing ?? false,
  }
  const update: Record<string, boolean> = {}
  if (allowDeletion !== undefined) {
    update.allowDeletion = allowDeletion
  }
  if (allowManagement !== undefined) {
    update.allowManagement = allowManagement
  }
  if (allowRotation !== undefined) {
    update.allowRotation = allowRotation
  }
  if (allowSharing !== undefined) {
    update.allowSharing = allowSharing
  }
  return sql`
    INSERT INTO  ${sql(TABLE_NAME)} ${sql(insert)}
    ON CONFLICT (${sql('userId')}, ${sql('nameFingerprint')})
    DO UPDATE
    SET ${sql(update)}
  `
}

export function deletePermission(
  sql: Sql,
  userId: string,
  nameFingerprint: string
) {
  return sql`
    DELETE
    FROM   ${sql(TABLE_NAME)}
    WHERE  ${sql('userId')}          = ${userId}
    AND    ${sql('nameFingerprint')} = ${nameFingerprint}
  `
}
