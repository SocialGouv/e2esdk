import type { Optional } from '@socialgouv/e2esdk-api'
import type { Sql } from 'postgres'
import { z } from 'zod'
import { getFirst } from './helpers.js'

export const TABLE_NAME = 'e2esdk_permissions'

export const permissionSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  userId: z.string(),
  keychainFingerprint: z.string(),
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
  keychainFingerprint: string
): Promise<PermissionFlags> {
  const results: PermissionFlags[] = await sql`
    SELECT ${sql(permissionFlags.keyof().options)}
    FROM   ${sql(TABLE_NAME)}
    WHERE  ${sql('userId')}          = ${userId}
    AND    ${sql('keychainFingerprint')} = ${keychainFingerprint}
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

export async function updatePermission(
  sql: Sql,
  {
    userId,
    keychainFingerprint,
    allowSharing,
    allowRotation,
    allowDeletion,
    allowManagement,
  }: Pick<PermissionSchema, 'userId' | 'keychainFingerprint'> &
    Partial<PermissionFlags>
) {
  const insert = {
    userId,
    keychainFingerprint,
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
  const results: PermissionFlags[] = await sql`
    INSERT INTO  ${sql(TABLE_NAME)} ${sql(insert)}
    ON CONFLICT (${sql('userId')}, ${sql('keychainFingerprint')})
    DO UPDATE
    SET ${sql(update)}
    RETURNING
      ${sql('allowSharing')},
      ${sql('allowRotation')},
      ${sql('allowDeletion')},
      ${sql('allowManagement')}
  `
  return getFirst(results)
}

export function deletePermission(
  sql: Sql,
  userId: string,
  keychainFingerprint: string
) {
  return sql`
    DELETE
    FROM   ${sql(TABLE_NAME)}
    WHERE  ${sql('userId')}          = ${userId}
    AND    ${sql('keychainFingerprint')} = ${keychainFingerprint}
  `
}
