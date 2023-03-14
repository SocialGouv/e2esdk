import { z } from 'zod'
import { base64Bytes } from './encodings'
import { identitySchema } from './identity'

const nonce = base64Bytes(32)

export const opaqueRegistrationRequest = z.object({
  registrationRequest: base64Bytes(32),
})

export const opaqueRegistrationResponse = z.object({
  nonce,
  registrationResponse: base64Bytes(64),
})

export const opaqueRegistrationRecord = z.object({
  nonce,
  registrationRecord: base64Bytes(192),
})

// --

export const opaqueLoginRequest = z.object({
  userId: identitySchema.shape.userId,
  loginRequest: base64Bytes(96),
})

export const opaqueLoginResponse = z.object({
  nonce,
  loginResponse: base64Bytes(320),
})

export const opaqueLoginFinal = z.object({
  nonce,
  loginFinal: base64Bytes(64),
})
