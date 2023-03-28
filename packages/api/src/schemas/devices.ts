import { z } from 'zod'
import { base64Bytes, secretBoxCiphertextV1Schema } from './encodings'
import { identitySchema } from './identity'

export const deviceIdSchema = z.string().uuid()
export const deviceLabelSchema = secretBoxCiphertextV1Schema('txt')

const deviceSecretSchema = base64Bytes(32)

export function encodeDeviceRegistrationURI(
  userId: string,
  deviceId: string,
  deviceSecret: string
) {
  const uri = new URL('e2esdk://register-device')
  uri.searchParams.set('userId', userId)
  uri.searchParams.set('deviceId', deviceId)
  uri.searchParams.set('deviceSecret', deviceSecret)
  return uri.toString()
}

export function decodeDeviceRegistrationURI(uri: string) {
  const url = new URL(uri)
  if (url.protocol !== 'e2esdk:' || url.pathname !== '//register-device') {
    throw new Error('Invalid device registration data')
  }
  const userId = identitySchema.shape.userId.parse(
    url.searchParams.get('userId')
  )
  const deviceId = deviceIdSchema.parse(url.searchParams.get('deviceId'))
  const deviceSecret = deviceSecretSchema.parse(
    url.searchParams.get('deviceSecret')
  )
  return {
    userId,
    deviceId,
    deviceSecret,
  }
}
