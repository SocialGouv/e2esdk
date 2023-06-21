import { ServerSetup } from '@47ng/opaque-server'
import { base64Bytes } from '@socialgouv/e2esdk-api'
import { base64UrlDecode } from '@socialgouv/e2esdk-crypto'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

// Source: https://twitter.com/mikkmartin/status/1577195937780228096

const booleanSchema = z
  .string()
  .transform(value => ['true', 'yes', '1', 'on'].includes(value.toLowerCase()))

const corsOriginSchema = z.union([
  z.string().url(),
  z
    .string()
    .regex(/^\/.+\$\/$/)
    .transform(pattern => new RegExp(pattern.slice(1, pattern.length - 1))),
])

const envSchema = z.object({
  // Required env
  NODE_ENV: z.enum(['development', 'production', 'test'] as const),
  POSTGRESQL_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /**
   * OPAQUE server secret setup
   *
   * Generate one with `pnpm generate opaque`
   */
  OPAQUE_SERVER_SETUP: base64Bytes(128).transform(str => {
    return ServerSetup.deserialize(base64UrlDecode(str))
  }),

  /**
   * Session secrets
   *
   * Generate one with `pnpm generate secretBox`.
   *
   * You may pass multiple comma-separated values for rotation.
   * The first secret will be the one used for encrypting sessions,
   * and others may be used to accept older sessions.
   */
  SESSION_SECRETS: z
    .string()
    .regex(/^([\w-]{43})(?:,([\w-]{43}))*$/)
    .transform(env => env.split(',').map(base64UrlDecode)),

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

  /** Allow the server to listen on an insecure HTTP connection.
   *
   * By default, a TLS configuration (certificate & private key) is required
   * to enable end-to-end transport security, but it may be bypassed for
   * local development and tests.
   */
  DISABLE_TLS: booleanSchema.optional().default('false'),

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
    .transform(urls => {
      if (urls.indexOf(',') === -1) {
        return z.union([z.literal('*'), corsOriginSchema]).parse(urls)
      }
      return urls.split(',').map(url => corsOriginSchema.parse(url))
    }),

  /**
   * Allows computing database size usage in _health if using a metered DBaaS.
   */
  DATABASE_MAX_SIZE_BYTES: z
    .string()
    .default('0')
    .transform(value => parseInt(value)),
})

const secretEnvs: Array<keyof typeof envSchema.shape> = [
  'OPAQUE_SERVER_SETUP',
  'POSTGRESQL_URL',
  'REDIS_URL',
  'SESSION_SECRETS',
  'SIGNATURE_PRIVATE_KEY',
]

const res = envSchema.safeParse(process.env)

if (!res.success) {
  console.error(
    `Missing or invalid environment variable${
      res.error.errors.length > 1 ? 's' : ''
    }:
${res.error.errors.map(error => `  ${error.path}: ${error.message}`).join('\n')}
`
  )
  process.exit(1)
}

export const env = Object.freeze(res.data)

for (const secretEnv of secretEnvs) {
  delete process.env[secretEnv]
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
