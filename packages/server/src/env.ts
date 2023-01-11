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

  /**
   * URL where this server can be reached.
   *
   * Used when verifying signed requests and signing responses,
   * to resolve the full URL.
   *
   * Must be passed to the e2esdk Client as configuration.
   */
  DEPLOYMENT_URL: z.string().url(),

  /**
   * Ed25519 signature public key, associated to the `SIGNATURE_PRIVATE_KEY`
   * environment variable.
   *
   * Must be passed to the e2esdk Client as configuration.
   */
  SIGNATURE_PUBLIC_KEY: z.string().regex(/^[\w-]{43}$/),

  /**
   * Ed25519 signature private key to sign responses.
   */
  SIGNATURE_PRIVATE_KEY: z.string().regex(/^[\w-]{86}$/),

  // Optional variables --

  /**
   * Debug mode increases log level to `debug` and prints extra information.
   */
  DEBUG: booleanSchema.default('false'),

  /**
   * Optional way to identify a deployment. Used in logs and Sentry release.
   */
  DEPLOYMENT_TAG: z.string().optional().default('local'),

  /** Allow the server to skip code signature check in test environments.
   *
   * Local examples run the server from a Docker compose stack, which uses
   * a production build that usually checks for a code signature.
   * In order to avoid having to self-sign a local development environment,
   * we can override the code signature check using this environment variable.
   */
  DISABLE_CODE_SIGNATURE_CHECK: booleanSchema.optional().default('false'),

  /**
   * Allow disabling signups for demo instances.
   */
  DISABLE_SIGNUP: booleanSchema.optional().default('false'),

  /**
   * URL to a webhook server that will be called with authorization
   * requests and sent notifications when certain events happen on the server.
   */
  WEBHOOK_URL: z.string().url().optional(),

  /**
   * CORS is disabled in local development, use this to force it,
   * in conjunction with the `CORS_ALLOWED_ORIGINS` environment variable.
   */
  CORS_FORCE_ENABLE: booleanSchema.default('false'),

  /**
   * List of comma-separated origins allowed for CORS.
   *
   * Items can be a URL, or a regexp if surrounded by `/` and `$/`.
   *
   * Example: this will match
   * - example.com
   * - all subdomains (but not TLD) of foo.xyz
   *
   * ```env
   * CORS_ALLOWED_ORIGINS=https://example.com,/\.foo.xyz$/
   * ```
   */
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

  /**
   * Allows computing database size usage in _health if using a metered DBaaS.
   */
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
