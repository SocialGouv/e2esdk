import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../env.js'
import type { App } from '../types'

const swaggerPlugin: FastifyPluginAsync = async (app: App) => {
  await app.register(swagger, {
    openapi: {
      tags: [
        { name: 'identity', description: 'Cryptographic user identities' },
        { name: 'keychain', description: 'Working with our own keys' },
        { name: 'sharedKeys', description: 'Sharing keys with others' },
        { name: 'permissions', description: 'Managing authorization' },
      ],
      info: {
        title: app.pkg.name,
        version: `${app.pkg.version} (${env.DEPLOYMENT_TAG})`,
        description: app.pkg.description,
        license: {
          name: app.pkg.license,
          url: 'https://github.com/SocialGouv/e2esdk/blob/main/LICENSE',
        },
      },
      externalDocs: {
        description: 'GitHub repository',
        url: app.codeSignature.sourceURL,
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
  dependencies: ['pkg', 'codeSignature'],
  decorators: {
    fastify: ['pkg', 'codeSignature'],
  },
})
