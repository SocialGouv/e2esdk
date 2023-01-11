import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  sceauSchema,
  SceauVerificationSuccess,
  SCEAU_FILE_NAME,
  verify,
} from 'sceau'
import { fileURLToPath } from 'url'
import { env } from '../env.js'
import type { App } from '../types'

type Decoration = Omit<SceauVerificationSuccess, 'outcome'>

declare module 'fastify' {
  interface FastifyInstance {
    codeSignature: Decoration
  }
}

const codeSignaturePlugin: FastifyPluginAsync = async (app: App) => {
  const defaultDecoration: Decoration = {
    timestamp: 'unknown',
    buildURL: 'local',
    sourceURL: 'local',
  }
  if (env.NODE_ENV !== 'production') {
    app.decorate('codeSignature', defaultDecoration)
    return
  }
  if (env.DISABLE_CODE_SIGNATURE_CHECK) {
    app.log.warn('Code signature disabled by env flag')
    app.decorate('codeSignature', defaultDecoration)
    return
  }
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
  const { outcome: _, ...decoration } = result
  app.decorate('codeSignature', decoration)
}

export default fp(codeSignaturePlugin, {
  fastify: '4.x',
  name: 'codeSignature',
  dependencies: ['sodium'],
  decorators: {
    fastify: ['sodium'],
  },
})
