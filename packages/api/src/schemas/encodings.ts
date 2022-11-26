import { z } from 'zod'

export const thirtyTwoBytesBase64Schema = z.string().regex(/^[\w-]{43}$/)
export const encryptedSharingPrivateKeySchema = z.string().regex(/^[\w-]{96}$/)
export const encryptedSignaturePrivateKeySchema = z
  .string()
  .regex(/^[\w-]{139}$/)

export const fingerprintSchema = thirtyTwoBytesBase64Schema

export const signedHashSchema = z.string().regex(/^[\w-]{86}$/)

export const timestampSchema = z.string() // todo: Refine for ISO8601

// Ciphers --

export const boxCiphertextV1Schema = z
  .string()
  .regex(/^v1\.box\.txt\.[\w-]{32}\.[\w-]{22,}$/)

export const secretBoxCiphertextV1Schema = z
  .string()
  .regex(/^v1\.secretBox\.txt\.[\w-]{32}\.[\w-]{22,}$/)
