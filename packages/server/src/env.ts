import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

// Source: https://twitter.com/mikkmartin/status/1577195937780228096

const booleanSchema = z
  .string()
  .transform(value => ['true', 'yes', '1', 'on'].includes(value.toLowerCase()))

const envSchema = z.object({
  // Required env
  NODE_ENV: z.enum(['development', 'production', 'test'] as const),
  POSTGRESQL_URL: z.string().url(),
  DEPLOYMENT_URL: z.string().url(),
  RELEASE_TAG: z.string(),
  SIGNATURE_PUBLIC_KEY: z.string().regex(/^[\w-]{43}$/),
  SIGNATURE_PRIVATE_KEY: z.string().regex(/^[\w-]{86}$/),

  // Optional variables
  DEBUG: booleanSchema.optional().default('false'),
})

envSchema.parse(process.env)

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
