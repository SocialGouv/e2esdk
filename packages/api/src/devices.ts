import { z } from 'zod'
import { deviceIdSchema, deviceLabelSchema } from './schemas/devices'
import {
  secretBoxCiphertextV1Schema,
  timestampSchema,
} from './schemas/encodings'
import {
  opaqueRegistrationRecord,
  opaqueRegistrationRequest,
  opaqueRegistrationResponse,
} from './schemas/opaque'
import { activeSessionSchema } from './session'

// --

export const deviceSchema = z.object({
  id: deviceIdSchema,
  createdAt: timestampSchema,
  enrolledFrom: deviceIdSchema.optional(),
  wrappedMainKey: secretBoxCiphertextV1Schema('bin'),
  label: deviceLabelSchema.optional(),
})
export type Device = z.infer<typeof deviceSchema>

// --

export const listDevicesResponseBody = z.array(
  deviceSchema.omit({ wrappedMainKey: true }).extend({
    sessions: z.array(
      activeSessionSchema.pick({
        ip: true,
        sessionId: true,
      })
    ),
  })
)
export type ListDevicesResponseBody = z.infer<typeof listDevicesResponseBody>

// --

export const deviceEnrollmentRequest = opaqueRegistrationRequest
export type DeviceEnrollmentRequest = z.infer<typeof deviceEnrollmentRequest>

export const deviceEnrollmentResponse = opaqueRegistrationResponse
export type DeviceEnrollmentResponse = z.infer<typeof deviceEnrollmentResponse>

// --

export const deviceEnrollmentRecord = opaqueRegistrationRecord.extend({
  deviceLabel: deviceLabelSchema.optional(),
  wrappedMainKey: secretBoxCiphertextV1Schema('bin'),
})
export type DeviceEnrollmentRecord = z.infer<typeof deviceEnrollmentRecord>

// --

export const deviceEnrolledResponse = z.object({
  deviceId: deviceIdSchema,
})
export type DeviceEnrolledResponse = z.infer<typeof deviceEnrolledResponse>
