// Inspired from https://github.com/porsager/postgres-shift

import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql } from 'postgres'

// Constants --

const __dirname = dirname(fileURLToPath(import.meta.url))

export const MIGRATIONS_TABLE_NAME = 'e2esdk_migrations'
export const MIGRATIONS_DIR = resolve(
  __dirname,
  '../../src/database/migrations'
)
const INDEX_LEN = 5 // number of digits in indices, eg 00042

const indexRegexp = new RegExp(`^[0-9]{${INDEX_LEN}}_`)

// Types --

export type FileSystemMigration = {
  id: number
  path: string
  name: string
}

export type DatabaseMigration = {
  id: number
  name: string
  createdAt: string
}

// --

export async function listMigrations(sql: Sql) {
  const { migrations: fsMigrations, mismatching: mismatchingMigrations } =
    await getFilesystemMigrations()
  const dbMigrations = await getDatabaseMigrations(sql)
  const appliedMigrations = dbMigrations.filter(db =>
    fsMigrations.find(fs => fs.id === db.id && fs.name === db.name)
  )
  const pendingMigrations = fsMigrations.filter(
    fs => !dbMigrations.find(db => fs.id === db.id && fs.name === db.name)
  )
  const upstreamMigrations = dbMigrations.filter(
    db => !fsMigrations.find(fs => fs.id === db.id && fs.name === db.name)
  )
  const conflictingMigrations = pendingMigrations.filter(fs =>
    upstreamMigrations.find(db => fs.id >= db.id)
  )
  return {
    fsMigrations,
    dbMigrations,
    mismatchingMigrations,
    appliedMigrations,
    pendingMigrations,
    upstreamMigrations,
    conflictingMigrations,
  }
}

// Helpers --

async function getFilesystemMigrations() {
  const paths = await fs.readdir(MIGRATIONS_DIR)
  type Mismatching = {
    expectedId: number
    migration: FileSystemMigration
  }
  const mismatching: Mismatching[] = []
  const migrations = paths
    .filter(
      x =>
        fsSync.statSync(resolve(MIGRATIONS_DIR, x)).isDirectory() &&
        indexRegexp.test(x)
    )
    .sort()
    .map((x, i) => {
      const migration: FileSystemMigration = {
        id: parseInt(x.slice(0, INDEX_LEN)),
        path: resolve(MIGRATIONS_DIR, x),
        name: x.slice(INDEX_LEN + 1).replace(/-/g, ' '),
      }
      if (migration.id !== i + 1) {
        mismatching.push({
          expectedId: i + 1,
          migration,
        })
      }
      return migration
    })

  return { migrations, mismatching }
}

function getDatabaseMigrations(sql: Sql): Promise<DatabaseMigration[]> {
  return sql`
    SELECT * FROM ${sql(MIGRATIONS_TABLE_NAME)}
    ORDER BY id ASC
  `
}
