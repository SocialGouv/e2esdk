import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { App } from '../types'

const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  license: z.string(),
  description: z.string(),
})

declare module 'fastify' {
  interface FastifyInstance {
    pkg: z.infer<typeof packageJsonSchema>
  }
}

const pkgPlugin: FastifyPluginAsync = async (app: App) => {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json'
  )
  const packageJson = await fs.readFile(packageJsonPath, { encoding: 'utf8' })
  app.decorate('pkg', packageJsonSchema.parse(JSON.parse(packageJson)))
}

export default fp(pkgPlugin, {
  fastify: '4.x',
  name: 'pkg',
})
