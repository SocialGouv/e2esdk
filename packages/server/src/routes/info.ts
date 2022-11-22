import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '../env.js'
import type { App } from '../types'

export const prefixOverride = '/'

const infoResponseBody = z.object({
  release: z.string(),
  deploymentURL: z.string(),
  signaturePublicKey: z.string(),
})

export default async function infoRoutes(app: App) {
  app.get<{
    Reply: z.infer<typeof infoResponseBody>
  }>(
    '/',
    {
      schema: {
        response: {
          200: zodToJsonSchema(infoResponseBody),
        },
      },
    },
    async function info(_, res) {
      return res.send({
        release: env.RELEASE_TAG,
        deploymentURL: env.DEPLOYMENT_URL,
        signaturePublicKey: env.SIGNATURE_PUBLIC_KEY,
      })
    }
  )
}
