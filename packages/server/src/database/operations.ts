#!/usr/bin/env zx

// Inspired from https://github.com/porsager/postgres-shift

import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import postgres, { Sql } from 'postgres'
import { spinner } from 'zx/experimental'
import 'zx/globals'
import { databaseConnectionOptions } from './connectionOptions.js'
import {
  DatabaseMigration,
  FileSystemMigration,
  listMigrations as _listMigrations,
  MIGRATIONS_DIR,
  MIGRATIONS_TABLE_NAME,
} from './migrations.js'

// Constants --

const SEED_SCRIPT = resolve(__dirname, 'seeds', 'index.js')
const INDEX_LEN = 5 // number of digits in indices, eg 00042

const indexRegexp = new RegExp(`^[0-9]{${INDEX_LEN}}_`)

// Usage --

function printUsage() {
  console.log(`
  ${chalk.bold('Manage PostgreSQL database operations')}

  Usage:
    ${chalk.dim('$')} pnpm db ${chalk.green('[operation]')} ${chalk.dim(
    '(OPTIONS)'
  )}

  Operations:
    ${chalk.green('•')} migrations init    ${chalk.dim(
    `Create the migrations table if missing ${chalk.italic(
      '(done automatically when applying migrations)'
    )}`
  )}
    ${chalk.green('•')} migrations new    ${chalk.dim(
    'Create a new migration file'
  )}
    ${chalk.green('•')} migrations list   ${chalk.dim(
    'List applied and pending migrations'
  )}
    ${chalk.green('•')} migrations apply  ${chalk.dim(
    'Apply all pending migrations'
  )}
    ${chalk.green('•')} seed             ${chalk.dim(
    `Run seed script (${SEED_SCRIPT})`
  )}
    ${chalk.green('•')} reset            ${chalk.dim('Reset the database')}

  Options:
    --help                      Show this message
    --dry-run                   Don't actually apply migrations, print what would happen.
    --dangerously-skip-confirm  Don't confirm database reset ${chalk.italic.dim(
      "(you've been warned)"
    )}
`)
}

if (argv.help) {
  printUsage()
  process.exit(0)
}

// --

dotenv.config()

if (!process.env.POSTGRESQL_URL) {
  console.error(
    `Missing required environment variable ${chalk.bold('POSTGRESQL_URL')}`
  )
  process.exit(1)
}

const dryRun = Boolean(argv['dry-run'])

const sql = postgres(process.env.POSTGRESQL_URL, databaseConnectionOptions)

if (argv._[0] === 'migrations' && argv._[1] === 'init') {
  printConnectionInfo()
  const { created } = await ensureMigrationsTableExists()
  if (created) {
    console.info(`✅ Created migrations table`)
  } else {
    console.info('✅ The migration table already exists, nothing to do.')
  }

  process.exit(0)
}

if (argv._[0] === 'migrations' && argv._[1] === 'new') {
  await createNewMigrationFile()
  process.exit(0)
}

if (argv._[0] === 'migrations' && argv._[1] === 'list') {
  await listMigrations()
  process.exit(0)
}

if (argv._[0] === 'migrations' && argv._[1] === 'apply') {
  await applyPendingMigrations()
  process.exit(0)
}

if (argv._[0] === 'seed') {
  await runSeedScript()
  process.exit(0)
}

if (argv._[0] === 'reset') {
  await resetDatabase()
  process.exit(0)
}

console.error('Missing required operation')
printUsage()
process.exit(1)

// Operations --

async function createNewMigrationFile() {
  printConnectionInfo()
  const existingMigrations = await getFilesystemMigrations()
  const migrationName = await question('Migration name: ')
  const migrationSlug = migrationName.replace(/[\s_]/g, '-').toLowerCase()
  const latest = existingMigrations.at(-1)
  const newID = indexToStr((latest?.id ?? 0) + 1)
  const sqlFilePath = resolve(
    MIGRATIONS_DIR,
    `${newID}_${migrationSlug}`,
    'migration.sql'
  )
  const mjsFilePath = resolve(
    MIGRATIONS_DIR,
    `${newID}_${migrationSlug}`,
    'migration.mjs'
  )
  await fs.mkdir(dirname(sqlFilePath))
  await Promise.all([
    fs.writeFile(
      sqlFilePath,
      `-- Migration ${newID} - ${migrationName}
-- Generated on ${new Date().toISOString()}

-- todo: Add migration code here
  `,
      { encoding: 'utf8' }
    ),
    fs.writeFile(
      mjsFilePath,
      `// @ts-check
// Migration ${newID} - ${migrationName}
// Generated on ${new Date().toISOString()}

/**
 * @param {import('postgres').Sql} sql
 */
export async function apply(sql) {
  // todo: Add data migration code here
}
`,
      { encoding: 'utf8' }
    ),
  ])

  console.info(`
✨ Created migration files:
  SQL ${chalk.dim('(schema updates) ' + sqlFilePath)}
  ESM ${chalk.dim('(data updates)   ' + mjsFilePath)}`)
}

async function listMigrations() {
  printConnectionInfo()
  await ensureMigrationsTableExists()

  const {
    fsMigrations,
    dbMigrations,
    appliedMigrations,
    pendingMigrations,
    upstreamMigrations,
    conflictingMigrations,
  } = await _listMigrations(sql)

  const longestNameLength = Math.max(
    fsMigrations.reduce((l, m) => Math.max(l, m.name.length), 0),
    dbMigrations.reduce((l, m) => Math.max(l, m.name.length), 0)
  )

  const appliedMigrationsText = `✅ Applied migrations:
   ${appliedMigrations
     .map(
       m =>
         `${chalk.dim(indexToStr(m.id))} ${m.name.padEnd(
           longestNameLength
         )} ${chalk.dim(m.createdAt)}`
     )
     .join('\n   ')}
  `
  const pendingMigrationsText = `⏳ Pending migrations:
   ${pendingMigrations
     .map(
       m =>
         `${chalk.dim(indexToStr(m.id))} ${m.name.padEnd(
           longestNameLength
         )} ${chalk.dim(m.path)}`
     )
     .join('\n   ')}
  `
  const upstreamMigrationsText = `📥 Upstream migrations:
   ${upstreamMigrations
     .map(
       m =>
         `${chalk.dim(indexToStr(m.id))} ${m.name.padEnd(
           longestNameLength
         )} ${chalk.dim(m.createdAt)}`
     )
     .join('\n   ')}
${chalk.dim
  .italic(`Those have been applied to the database, but you don't have migration files for them.
You might be on a branch that is not up to date with the database state.`)}
  `

  const conflictingMigrationsText = `🚨 ${chalk.red('Conflicts detected!')}
   The following pending migrations will conflict with upstream migrations.
   Re-index them as follows before applying:

   ${conflictingMigrations
     .map(
       m =>
         `${chalk.red(indexToStr(m.id))} -> ${chalk.green(
           indexToStr(m.id + upstreamMigrations.length)
         )} ${m.name.padEnd(longestNameLength)}`
     )
     .join('\n   ')}
  `

  console.info(
    [
      appliedMigrations.length > 0 && appliedMigrationsText,
      pendingMigrations.length > 0 && pendingMigrationsText,
      upstreamMigrations.length > 0 && upstreamMigrationsText,
      conflictingMigrations.length > 0 && conflictingMigrationsText,
    ]
      .filter(Boolean)
      .join('\n')
  )
}

async function applyPendingMigrations() {
  printConnectionInfo()
  await ensureMigrationsTableExists()
  const fsMigrations = await getFilesystemMigrations()
  console.info(
    `🔍 ${fsMigrations.length} migration${
      fsMigrations.length === 1 ? '' : 's'
    } found in ${chalk.dim(MIGRATIONS_DIR)}`
  )
  const current = await getCurrentDatabaseMigrationId()
  const pending = fsMigrations.slice(current ? current.id : 0)
  if (!pending.length) {
    console.info('✅ No pending migrations to apply.')
    return
  }
  console.info(`⏳ ${pending.length} pending migration${
    pending.length === 1 ? '' : 's'
  } to apply:
     ${pending
       .map(migration => `${indexToStr(migration.id)} - ${migration.name}`)
       .join('\n     ')}
  `)

  while (pending.length) {
    const current = pending.shift()
    if (!current) break
    await sql.begin(sql =>
      spinner(() =>
        apply(sql, current).catch(error => {
          console.error(error)
          console.info(
            `🔄 Last migration has been rolled back ${chalk.dim(
              `(${indexToStr(current.id)} - ${current.name})`
            )}`
          )
          process.exit(1)
        })
      )
    )
  }

  async function apply(sql: Sql, { path, id, name }: FileSystemMigration) {
    const schemaMigrationFile = resolve(path, 'migration.sql')
    const dataMigrationFile = resolve(path, 'migration.mjs')
    const hasSchemaMigration = fs.existsSync(schemaMigrationFile)
    const hasDataMigration = fs.existsSync(dataMigrationFile)

    if (!hasSchemaMigration && !hasDataMigration) {
      throw new Error(`
  🚨 ${chalk.red(`No file found for migration ${indexToStr(id)}`)}

  Make sure at least one of those exist:
    - ${chalk.dim('schema migration')} ${schemaMigrationFile}
    - ${chalk.dim('data migration')}   ${dataMigrationFile}
`)
    }

    console.info(
      `⚙️ Applying migration ${indexToStr(id)} - ${name} ${chalk.italic.dim(
        '(' +
          [hasSchemaMigration && 'schema', hasDataMigration && 'data']
            .filter(Boolean)
            .join(' + ') +
          ')'
      )}`
    )

    // Run schema migration first
    if (hasSchemaMigration) {
      console.info(
        chalk.dim(`  ${hasDataMigration ? '├' : '└'} ${schemaMigrationFile}`)
      )
      if (!dryRun) {
        await sql.file(schemaMigrationFile)
      }
    }
    // Run data migrations (if any)
    if (hasDataMigration) {
      console.info(chalk.dim(`  └ ${dataMigrationFile}`))
      const { apply } = await import(dataMigrationFile)
      if (!dryRun) {
        await apply(sql)
      }
    }
    if (dryRun) {
      return
    }
    await sql`
    INSERT INTO ${sql(MIGRATIONS_TABLE_NAME)} (
      id,
      name
    ) VALUES (
      ${id},
      ${name}
    )
  `
  }
}

async function runSeedScript() {
  printConnectionInfo()
  console.info(
    chalk.green(`🌱 Seeding database using script `) + chalk.dim(SEED_SCRIPT)
  )
  const { apply } = await import(SEED_SCRIPT)
  if (!dryRun) {
    try {
      await apply(sql)
      console.info(`✅ The database has been seeded.`)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
}

async function resetDatabase() {
  printConnectionInfo()
  console.warn(
    chalk.yellowBright(
      `⚠️ You are about to drop all tables in database ${chalk.bold(
        sql.options.database
      )}:`
    )
  )
  // https://stackoverflow.com/a/2611745
  const tables = await sql`
    WITH tbl AS (
      SELECT table_schema, TABLE_NAME
      FROM information_schema.tables
      WHERE TABLE_NAME not like 'pg_%'
      AND table_schema in ('public')
    )
    SELECT
      table_schema,
      TABLE_NAME,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, TABLE_NAME), FALSE, TRUE, '')))[1]::text::int AS row_count
    FROM tbl
    ORDER BY row_count DESC
  `
  if (tables.length === 0) {
    console.info('Database is empty')
  } else {
    console.table(
      tables.map(({ tableName, rowCount }) => ({
        'table name': tableName,
        rows: parseInt(rowCount),
      }))
    )
  }
  if (!argv['dangerously-skip-confirm']) {
    const confirm = await question('Enter the database name to confirm: ')
    if (confirm !== sql.options.database) {
      console.info('Aborted')
      return
    }
  }
  await sql`DROP SCHEMA public CASCADE`
  await sql`CREATE SCHEMA public`
  console.info(
    `The database has been reset, run migrations again with:

    ${chalk.dim('$')} pnpm db migrations apply
`
  )
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
        fs.statSync(resolve(MIGRATIONS_DIR, x)).isDirectory() &&
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

  if (mismatching.length) {
    console.error(
      `
  ${chalk.red.bold('🚨 Mismatching migration files indexing')}

  The following migration(s) are numbered incorrectly:
    ${mismatching
      .map(
        ({ expectedId, migration }) =>
          `${chalk.red(indexToStr(migration.id))} (should be ${chalk.green(
            indexToStr(expectedId)
          )}) ${chalk.dim(migration.path + '/migration.sql')}`
      )
      .join('\n    ')}
`
    )
    process.exit(1)
  }
  return migrations
}

function indexToStr(index: number) {
  return index.toFixed().padStart(INDEX_LEN, '0')
}

async function ensureMigrationsTableExists() {
  try {
    await sql`SELECT '${sql(MIGRATIONS_TABLE_NAME)}'::regclass`
    return { created: false }
  } catch {
    if (dryRun) {
      console.error(
        `${chalk.red(
          `🚨 The migration table ${chalk.bold(
            MIGRATIONS_TABLE_NAME
          )} is missing in the database`
        )}
  Because we're in dry run mode, it won't be created and we can't continue.
  You can create it with the command:
  ${chalk.dim('$')} pnpm db migrations init
`
      )
      process.exit(1)
    }
    console.info(
      chalk.green(
        `✨ Creating migrations table ${chalk.bold(MIGRATIONS_TABLE_NAME)}`
      )
    )
    await sql`
    CREATE TABLE ${sql(MIGRATIONS_TABLE_NAME)} (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      NAME TEXT
    )
  `
    return { created: true }
  }
}

function getCurrentDatabaseMigrationId() {
  return sql<Pick<DatabaseMigration, 'id'>[]>`
    SELECT id FROM ${sql(MIGRATIONS_TABLE_NAME)}
    ORDER BY id DESC
    LIMIT 1
`.then(([first]) => first)
}

function printConnectionInfo() {
  console.info(
    chalk.dim(
      `🔌 Connecting to PostgreSQL database ${chalk.blue(
        sql.options.database
      )} on ${chalk.green(sql.options.host)}:${chalk.dim(sql.options.port)}`
    )
  )
  if (dryRun) {
    console.info(
      `${chalk.green(
        '🧪 Dry-run mode'
      )} - no modification will be made to the database.`
    )
  }
}
