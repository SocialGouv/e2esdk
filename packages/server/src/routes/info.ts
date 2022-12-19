import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sceauSchema, SCEAU_FILE_NAME, verify } from 'sceau'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '../env.js'
import type { App } from '../types'

export const prefixOverride = ''

const infoResponseBody = z.object({
  version: z.string(),
  release: z.string(),
  buildURL: z.string(),
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

async function verifyCodeSignature(app: App) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  )
  const sceauFilePath = path.resolve(rootDir, SCEAU_FILE_NAME)
  const sceauFileContents = await fs
    .readFile(sceauFilePath, { encoding: 'utf8' })
    .catch(error => {
      app.log.fatal({ msg: 'Failed to read code signature file', error })
      process.exit(1)
    })
  const sceau = sceauSchema.parse(JSON.parse(sceauFileContents))
  const result = await verify(
    app.sodium,
    sceau,
    rootDir,
    app.sodium.from_hex(sceau.publicKey)
  )
  if (result.outcome === 'failure') {
    app.log.fatal({
      msg: 'Invalid code signature',
      manifestErrors: result.manifestErrors,
      signatureVerified: result.signatureVerified,
    })
    process.exit(0)
  }
  app.log.info({
    msg: 'Code signature verified',
    signedOn: result.timestamp,
    sources: result.sourceURL,
    build: result.buildURL,
  })
}

// --

export default async function infoRoutes(app: App) {
  if (env.NODE_ENV === 'production') {
    await verifyCodeSignature(app)
  }
  const version = await readVersion()
  const serverInfo: InfoResponseBody = {
    version,
    release: env.RELEASE_TAG,
    buildURL: env.BUILD_URL,
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
