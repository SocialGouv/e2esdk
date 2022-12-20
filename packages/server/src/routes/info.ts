import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '../env.js'
import type { App } from '../types'

export const prefixOverride = ''

const infoResponseBody = z.object({
  version: z.string(),
  builtAt: z.string(),
  buildURL: z.string(),
  sourceURL: z.string(),
  deploymentTag: z.string(),
  deploymentURL: z.string(),
  signaturePublicKey: z.string(),
})
type InfoResponseBody = z.infer<typeof infoResponseBody>

async function readVersion() {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json'
  )
  try {
    const packageJson = await fs.readFile(packageJsonPath, { encoding: 'utf8' })
    return JSON.parse(packageJson).version
  } catch {
    return Promise.resolve('local')
  }
}

// --

export default async function infoRoutes(app: App) {
  const version = await readVersion()
  const serverInfo: InfoResponseBody = {
    version,
    builtAt: app.codeSignature.timestamp,
    buildURL: app.codeSignature.buildURL,
    sourceURL: app.codeSignature.sourceURL,
    deploymentTag: env.DEPLOYMENT_TAG,
    deploymentURL: env.DEPLOYMENT_URL,
    signaturePublicKey: env.SIGNATURE_PUBLIC_KEY,
  }
  app.log.info({
    msg: 'Server info',
    ...serverInfo,
  })

  app.get<{
    Reply: z.infer<typeof infoResponseBody>
  }>(
    '/',
    {
      schema: {
        summary: 'Get server info',
        response: {
          200: zodToJsonSchema(infoResponseBody),
        },
      },
    },
    async function getServerInfo(req, res) {
      return res.send(serverInfo)
    }
  )
}
