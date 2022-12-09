import { multipartSignature, numberToUint32LE, Sodium } from '@e2esdk/crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '../env.js'
import type { App } from '../types'

export const prefixOverride = ''

const manifestEntry = z.object({
  path: z.string(),
  hash: z.string(),
  signature: z.string(),
  sizeBytes: z.number(),
})

const infoResponseBody = z.object({
  release: z.string(),
  deploymentURL: z.string(),
  signaturePublicKey: z.string(),
  manifestSignature: z.string(),
  manifest: z.array(manifestEntry).optional(),
})
type InfoResponseBody = z.infer<typeof infoResponseBody>

const querystring = z.object({
  manifest: z.literal('true').optional().describe('Show extended manifest'),
})

type ManifestEntry = z.infer<typeof manifestEntry>

export default async function infoRoutes(app: App) {
  const buildDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../'
  )
  const signaturePrivateKey = app.sodium.from_base64(env.SIGNATURE_PRIVATE_KEY)
  const manifest = await generateManifest(
    app.sodium,
    signaturePrivateKey,
    buildDir
  )
  const manifestSignature = app.sodium.to_base64(
    multipartSignature(
      app.sodium,
      signaturePrivateKey,
      ...manifest.map(entry => app.sodium.from_base64(entry.hash))
    )
  )
  app.sodium.memzero(signaturePrivateKey)

  const serverInfo: InfoResponseBody = {
    release: env.RELEASE_TAG,
    deploymentURL: env.DEPLOYMENT_URL,
    signaturePublicKey: env.SIGNATURE_PUBLIC_KEY,
    manifestSignature,
  }
  app.log.info({
    msg: 'Server info',
    ...serverInfo,
    manifest: env.NODE_ENV === 'production' || env.DEBUG ? manifest : undefined,
  })

  app.get<{
    Reply: z.infer<typeof infoResponseBody>
    Querystring: z.infer<typeof querystring>
  }>(
    '/',
    {
      schema: {
        summary: 'Get server info',
        querystring: zodToJsonSchema(querystring),
        response: {
          200: zodToJsonSchema(infoResponseBody),
        },
      },
    },
    async function getServerInfo(req, res) {
      const body = {
        ...serverInfo,
        manifest: req.query.manifest === 'true' ? manifest : undefined,
      }
      return res.send(body)
    }
  )
}

// --

async function* walk(dir: string): AsyncGenerator<string> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      yield* walk(res)
    } else {
      yield res
    }
  }
}

async function generateManifest(
  sodium: Sodium,
  privateKey: Uint8Array,
  basePath: string
) {
  const manifest: ManifestEntry[] = []
  for await (const filePath of walk(basePath)) {
    const buffer = await fs.readFile(filePath, { encoding: null })
    const hash = sodium.crypto_generichash(
      sodium.crypto_generichash_BYTES,
      buffer
    )
    const signature = sodium.to_base64(
      multipartSignature(
        sodium,
        privateKey,
        sodium.from_string(filePath),
        numberToUint32LE(buffer.byteLength),
        hash
      )
    )
    manifest.push({
      path: filePath,
      hash: sodium.to_base64(hash),
      signature,
      sizeBytes: buffer.byteLength,
    })
  }
  return manifest
}
