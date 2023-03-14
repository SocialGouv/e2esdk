import { z } from 'zod'

export const base64Bytes = (bytes: number) =>
  z.string().regex(new RegExp(`^[\\w-]{${Math.ceil((bytes * 4) / 3)}}$`))

export const thirtyTwoBytesBase64Schema = base64Bytes(32)
export const sixtyFourBytesBase64Schema = base64Bytes(64)
export const thirtyTwoBytesHexSchema = z.string().regex(/^[0-9a-f]{64}$/i)

export const fingerprintSchema = thirtyTwoBytesBase64Schema
export const signatureSchema = sixtyFourBytesBase64Schema

// Naive ISO-8601 format parser (as returned by Date.toISOString())
// The regexp is here to translate to a static JSON schema validation,
// but won't deal with invalid dates, where the refinement will pick errors up.
export const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(v => Number.isSafeInteger(Date.parse(v)))

// Ciphertexts --

export const PayloadType = {
  buffer: 'bin', // Uint8Array
  string: 'txt', // string
  number: 'num', // number
  boolean: 'bool', // boolean
  json: 'json', // other
} as const

export type PayloadType = typeof PayloadType
export type PayloadTag = PayloadType[keyof PayloadType]

export const boxCiphertextV1Schema = (payloadTag: PayloadTag) =>
  z
    .string()
    .regex(new RegExp(`^v1\\.box\\.${payloadTag}\\.[\\w-]{32}\\.[\\w-]{22,}$`))
    .describe('Sodium box ciphertext (v1)')

export const secretBoxCiphertextV1Schema = (payloadTag: PayloadTag) =>
  z
    .string()
    .regex(
      new RegExp(`^v1\\.secretBox\\.${payloadTag}\\.[\\w-]{32}\\.[\\w-]{22,}$`)
    )
    .describe('Sodium secret box ciphertext (v1)')

export const sealedBoxCiphertextV1Schema = (payloadTag: PayloadTag) =>
  z
    .string()
    .regex(new RegExp(`^v1\\.sealedBox\\.${payloadTag}\\.[\\w-]{64,}$`))
    .describe('Sodium sealed box ciphertext (v1)')
