import { z } from 'zod'
import { deviceIdSchema } from './schemas/devices'
import {
  fingerprintSchema,
  signatureSchema,
  thirtyTwoBytesBase64Schema,
  timestampSchema,
} from './schemas/encodings'
import { identitySchema } from './schemas/identity'

export const requestHeaders = z.object({
  'x-e2esdk-user-id': identitySchema.shape.userId.describe('User ID'),
  'x-e2esdk-client-id': z.string().uuid().describe('Client ID'),
  'x-e2esdk-device-id': deviceIdSchema.describe('Device ID'),
  'x-e2esdk-session-id': fingerprintSchema.describe(
    'Session ID (fingerprint of the OPAQUE session key)'
  ),
  'x-e2esdk-timestamp': timestampSchema.describe(
    'Current time of request/response'
  ),
  'x-e2esdk-signature': signatureSchema.describe('Authentication signature'),
})
export type RequestHeaders = z.infer<typeof requestHeaders>

export const responseHeaders = requestHeaders
  .pick({
    'x-e2esdk-timestamp': true,
    'x-e2esdk-signature': true,
  })
  .extend({
    'x-e2esdk-server-pubkey': thirtyTwoBytesBase64Schema,
  })
export type ResponseHeaders = z.infer<typeof responseHeaders>
