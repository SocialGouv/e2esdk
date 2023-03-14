import { z } from 'zod'
import { deviceIdSchema, deviceLabelSchema } from './schemas/devices'
import { thirtyTwoBytesBase64Schema } from './schemas/encodings'

export const activeSessionSchema = z.object({
  ip: z.string(),
  deviceId: deviceIdSchema,
  deviceLabel: deviceLabelSchema,
  sessionId: thirtyTwoBytesBase64Schema,
})
export type ActiveSession = z.infer<typeof activeSessionSchema>

export const getActiveSessionsResponseBody = z.array(activeSessionSchema)
export type GetActiveSessionsResponseBody = z.infer<
  typeof getActiveSessionsResponseBody
>
