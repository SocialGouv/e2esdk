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
  RELEASE_TAG: z.string().optional().default('local'),
  BUILD_URL: z.string().url().optional().default('unknown://local'),
  SIGNATURE_PUBLIC_KEY: z.string().regex(/^[\w-]{43}$/),
  SIGNATURE_PRIVATE_KEY: z.string().regex(/^[\w-]{86}$/),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('*')
    .transform(urls =>
      urls.split(',').map(url => {
        if (url.startsWith('/') && url.endsWith('$/')) {
          return new RegExp(url.slice(1, url.length - 1))
        }
        return url
      })
    ),

  // Optional variables
  DEBUG: booleanSchema.default('false'),
  CORS_FORCE_ENABLE: booleanSchema.default('false'),
  DATABASE_MAX_SIZE_BYTES: z
    .string()
    .default('0')
    .transform(value => parseInt(value)),
})

const res = envSchema.safeParse(process.env)

if (!res.success) {
  console.error(
    `Missing or invalid environment variable${
      res.error.errors.length > 1 ? 's' : ''
    }:`
  )
  console.error(
    res.error.errors
      .map(error => `  ${error.path}: ${error.message}`)
      .join('\n')
  )
  process.exit(1)
}

export const env = res.data

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
