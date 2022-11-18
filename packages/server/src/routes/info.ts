import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { App } from '../types'

const infoResponseBody = z.object({
  release: z.string(),
  deploymentURL: z.string(),
  signaturePublicKey: z.string(),
})

export default async function infoRoutes(app: App) {
  app.get<{
    Reply: z.infer<typeof infoResponseBody>
  }>(
    '/info',
    {
      schema: {
        response: {
          200: zodToJsonSchema(infoResponseBody),
        },
      },
    },
    async function info(_, res) {
      return res.send({
        release: process.env.RELEASE_TAG,
        deploymentURL: process.env.DEPLOYMENT_URL,
        signaturePublicKey: process.env.SIGNATURE_PUBLIC_KEY,
      })
    }
  )
}
