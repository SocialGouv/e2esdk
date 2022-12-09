import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import postgres from 'postgres'
import { databaseConnectionOptions } from '../database/connectionOptions.js'
import { listMigrations } from '../database/migrations.js'
import '../env.js'
import { env } from '../env.js'
import type { App } from '../types'

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
  }
}

const databasePlugin: FastifyPluginAsync = async (app: App) => {
  const sql = postgres(env.POSTGRESQL_URL, {
    ...databaseConnectionOptions,
    debug: function traceDatabaseQuery(
      connection,
      query,
      parameters,
      paramTypes
    ) {
      if (
        query ===
        'SELECT pg_database_size(current_database()::name) AS size_used'
      ) {
        // Don't log periodic health check
        return
      }
      app.log.trace({
        category: 'database',
        msg: 'query',
        connection,
        query: query
          // Remove comments
          // https://stackoverflow.com/questions/7690380/regular-expression-to-match-all-comments-in-a-t-sql-script
          .replace(/(--.*)|(((\/\*)+?[\w\W]+?(\*\/)+))/g, '')
          // Minify whitespace
          .replace(/\s+/gm, ' ')
          .trim(),
        parameters,
        paramTypes,
      })
    },
  })

  const {
    mismatchingMigrations,
    conflictingMigrations,
    pendingMigrations,
    upstreamMigrations,
    appliedMigrations,
  } = await listMigrations(sql)

  if (
    mismatchingMigrations.length > 0 ||
    conflictingMigrations.length > 0 ||
    upstreamMigrations.length > 0 ||
    pendingMigrations.length > 0
  ) {
    app.log.fatal({
      msg: 'Server is not in sync with database migration state',
      appliedMigrations,
      pendingMigrations,
      upstreamMigrations,
      mismatchingMigrations,
      conflictingMigrations,
    })
    process.exit(1)
  }
  app.log.info({ msg: 'Migrations info', synchronized: true })
  app.log.debug({ msg: 'Applied migrations', appliedMigrations })
  app.decorate('db', sql)
}

export default fp(databasePlugin, {
  fastify: '4.x',
  name: 'database',
})
