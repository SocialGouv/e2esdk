import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { createRequire } from 'node:module'
import { env } from '../env.js'
import type { App } from '../types'

const swaggerPlugin: FastifyPluginAsync = async (app: App) => {
  const require = createRequire(import.meta.url)
  const pkg = require('../../package.json')
  await app.register(swagger, {
    openapi: {
      tags: [
        { name: 'identity', description: 'Cryptographic user identities' },
        { name: 'keychain', description: 'Working with our own keys' },
        { name: 'sharedKeys', description: 'Sharing keys with others' },
        { name: 'permissions', description: 'Managing authorization' },
      ],
      info: {
        title: pkg.name,
        version: `${pkg.version} (${env.RELEASE_TAG})`,
        description: pkg.description,
        license: {
          name: pkg.license,
          url: 'https://github.com/SocialGouv/e2esdk/blob/main/LICENSE',
        },
      },
      externalDocs: {
        description: 'GitHub repository',
        url: 'https://github.com/SocialGouv/e2esdk',
      },
    },
  })
  return app.register(swaggerUI, {
    logLevel: 'warn',
    staticCSP: true,
  })
}

export default fp(swaggerPlugin, {
  fastify: '4.x',
  name: 'swagger',
})
