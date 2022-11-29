import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import postgres from 'postgres'
import { databaseConnectionOptions } from '../database/connectionOptions.js'
import '../env.js'
import { env } from '../env.js'
import type { App } from '../types'

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
  }
}

const databasePlugin: FastifyPluginAsync = async (app: App) => {
  app.decorate(
    'db',
    postgres(env.POSTGRESQL_URL, {
      ...databaseConnectionOptions,
      debug:
        env.DEBUG &&
        function debugDatabaseQuery(connection, query, parameters, paramTypes) {
          if (
            query ===
            'SELECT pg_database_size(current_database()::name) AS size_used'
          ) {
            // Don't log periodic health check
            return
          }
          app.log.debug({
            msg: 'database:debug',
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
  )
}

export default fp(databasePlugin, {
  fastify: '4.x',
  name: 'database',
})
