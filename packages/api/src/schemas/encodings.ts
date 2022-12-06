import { z } from 'zod'

export const thirtyTwoBytesBase64Schema = z.string().regex(/^[\w-]{43}$/)
export const sixtyFourBytesBase64Schema = z.string().regex(/^[\w-]{86}$/)

export const fingerprintSchema = thirtyTwoBytesBase64Schema
export const signedHashSchema = sixtyFourBytesBase64Schema

// Naive ISO-8601 format parser (as returned by Date.toISOString())
// The regexp is here to translate to a static JSON schema validation,
// but won't deal with invalid dates, where the refinement will pick errors up.
export const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(v => Number.isSafeInteger(Date.parse(v)))

// Ciphertexts --

export const boxCiphertextV1Schema = z
  .string()
  .regex(/^v1\.box\.(bin|txt|num|bool|json)\.[\w-]{32}\.[\w-]{22,}$/)

export const secretBoxCiphertextV1Schema = z
  .string()
  .regex(/^v1\.secretBox\.(bin|txt|num|bool|json)\.[\w-]{32}\.[\w-]{22,}$/)

export const sealedBoxCiphertextV1Schema = z
  .string()
  .regex(/^v1\.sealedBox\.(bin|txt|num|bool|json)\.[\w-]{64,}$/)
