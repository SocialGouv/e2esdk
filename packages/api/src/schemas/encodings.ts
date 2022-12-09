import { z } from 'zod'

export const thirtyTwoBytesBase64Schema = z.string().regex(/^[\w-]{43}$/)
export const sixtyFourBytesBase64Schema = z.string().regex(/^[\w-]{86}$/)

export const fingerprintSchema = thirtyTwoBytesBase64Schema
export const signatureSchema = sixtyFourBytesBase64Schema

// Naive ISO-8601 format parser (as returned by Date.toISOString())
// The regexp is here to translate to a static JSON schema validation,
// but won't deal with invalid dates, where the refinement will pick errors up.
export const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\\.\d{3}Z$/)
  .refine(v => Number.isSafeInteger(Date.parse(v)))

// Ciphertexts --

type PayloadType = 'bin' | 'txt' | 'num' | 'bool' | 'json'

export const boxCiphertextV1Schema = (payloadType: PayloadType) =>
  z
    .string()
    .regex(new RegExp(`^v1\\.box\\.${payloadType}\\.[\\w-]{32}\\.[\\w-]{22,}$`))
    .describe('Sodium box ciphertext (v1)')

export const secretBoxCiphertextV1Schema = (payloadType: PayloadType) =>
  z
    .string()
    .regex(
      new RegExp(`^v1\\.secretBox\\.${payloadType}\\.[\\w-]{32}\\.[\\w-]{22,}$`)
    )
    .describe('Sodium secret box ciphertext (v1)')

export const sealedBoxCiphertextV1Schema = (payloadType: PayloadType) =>
  z
    .string()
    .regex(new RegExp(`^v1\\.sealedBox\\.${payloadType}\\.[\\w-]{64,}$`))
    .describe('Sodium sealed box ciphertext (v1)')
