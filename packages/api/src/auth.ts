import { z } from 'zod'
import { deviceEnrolledResponse, deviceEnrollmentRecord } from './devices'
import { deviceIdSchema } from './schemas/devices'
import { secretBoxCiphertextV1Schema } from './schemas/encodings'
import { identitySchema } from './schemas/identity'
import {
  opaqueLoginFinal,
  opaqueLoginRequest,
  opaqueLoginResponse,
  opaqueRegistrationRequest,
  opaqueRegistrationResponse,
} from './schemas/opaque'

export const signupRequest = opaqueRegistrationRequest.extend({
  userId: identitySchema.shape.userId,
})
export type SignupRequest = z.infer<typeof signupRequest>

export const signupResponse = opaqueRegistrationResponse
export type SignupResponse = z.infer<typeof signupResponse>

export const signupRecord = deviceEnrollmentRecord.extend(
  identitySchema.omit({ userId: true }).shape
)
export type SignupRecord = z.infer<typeof signupRecord>

export const signupCompleteResponse = deviceEnrolledResponse
export type SignupCompleteResponse = z.infer<typeof signupCompleteResponse>

// --

export const loginRequest = opaqueLoginRequest.extend({
  deviceId: deviceIdSchema,
})
export type LoginRequest = z.infer<typeof loginRequest>

export const loginResponse = opaqueLoginResponse
export type LoginResponse = z.infer<typeof loginResponse>

export const loginFinal = opaqueLoginFinal
export type LoginFinal = z.infer<typeof loginFinal>

export const loginFinalResponse = z.object({
  deviceLabel: secretBoxCiphertextV1Schema('txt').optional(),
  wrappedMainKey: secretBoxCiphertextV1Schema('bin'),
})
export type LoginFinalResponse = z.infer<typeof loginFinalResponse>
