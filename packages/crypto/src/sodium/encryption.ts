import type { Uint8ArrayOutputFormat } from 'libsodium-wrappers'
import {
  boolToByte,
  byteToBool,
  ieee754BytesToNumber,
  numberToIEEE754Bytes,
} from '../shared/codec'
import { concat, isEncryptable, isUint8Array, split } from '../shared/utils'
import type { Cipher } from './ciphers'
import type { Sodium } from './sodium'

// --

export enum PayloadType {
  bin = 'bin', // Uint8Array
  txt = 'txt', // string
  num = 'num', // number
  bool = 'bool', // boolean
  json = 'json', // other
}

export const encodedCiphertextFormatV1 = 'application/e2esdk.ciphertext.v1'
export type EncodedCiphertextFormat = typeof encodedCiphertextFormatV1
export type EncryptableJSONDataType = string | number | boolean

type CipherWithOptionalNonce = Cipher & {
  nonce?: Uint8Array
}

/**
 * Encrypt input data into a string representation
 *
 * @param input The data to encrypt
 * @param cipher The algorithm to use and its parameters
 * @param outputFormat The format to use
 */
export function encrypt<DataType extends Uint8Array | EncryptableJSONDataType>(
  sodium: Sodium,
  input: DataType,
  cipher: CipherWithOptionalNonce,
  outputFormat?: 'base64' | EncodedCiphertextFormat
): string

/**
 * Encrypt input data into a binary buffer
 *
 * This overload is recommended for binary inputs and where the cipher to use
 * is defined by convention.
 *
 * @param input The data to encrypt
 * @param cipher The algorithm to use and its parameters
 * @param outputFormat
 */
export function encrypt(
  sodium: Sodium,
  input: Uint8Array,
  cipher: CipherWithOptionalNonce,
  outputFormat?: Uint8ArrayOutputFormat
): Uint8Array

export function encrypt<DataType extends Uint8Array | EncryptableJSONDataType>(
  sodium: Sodium,
  input: DataType,
  cipher: CipherWithOptionalNonce,
  outputFormat:
    | Uint8ArrayOutputFormat
    | 'base64'
    | EncodedCiphertextFormat = encodedCiphertextFormatV1
) {
  const { payloadType, payload } = isUint8Array(input)
    ? {
        payloadType: PayloadType.bin,
        payload: input,
      }
    : typeof input === 'string'
    ? {
        payloadType: PayloadType.txt,
        payload: sodium.from_string(input),
      }
    : typeof input === 'number'
    ? {
        payloadType: PayloadType.num,
        payload: numberToIEEE754Bytes(input),
      }
    : typeof input === 'boolean'
    ? {
        payloadType: PayloadType.bool,
        payload: boolToByte(input),
      }
    : {
        payloadType: PayloadType.json,
        payload: sodium.from_string(JSON.stringify(input)),
      }

  if (cipher.algorithm === 'box') {
    const nonce =
      cipher.nonce ?? sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
    const ciphertext = sodium.crypto_box_easy(
      payload,
      nonce,
      cipher.publicKey,
      cipher.privateKey
    )
    if (outputFormat === encodedCiphertextFormatV1) {
      return [
        'v1',
        cipher.algorithm,
        payloadType,
        sodium.to_base64(nonce),
        sodium.to_base64(ciphertext),
      ].join('.')
    }
    if (outputFormat === 'uint8array') {
      return concat(nonce, ciphertext)
    }
    return sodium.to_base64(concat(nonce, ciphertext))
  }

  if (cipher.algorithm === 'sealedBox') {
    const ciphertext = sodium.crypto_box_seal(payload, cipher.publicKey)
    if (outputFormat === encodedCiphertextFormatV1) {
      // prettier-ignore
      return [
        'v1',
        cipher.algorithm,
        payloadType,
        sodium.to_base64(ciphertext),
      ].join('.')
    }
    if (outputFormat === 'uint8array') {
      return ciphertext
    }
    return sodium.to_base64(ciphertext)
  }

  if (cipher.algorithm === 'secretBox') {
    const nonce =
      cipher.nonce ?? sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = sodium.crypto_secretbox_easy(payload, nonce, cipher.key)
    if (outputFormat === encodedCiphertextFormatV1) {
      return [
        'v1',
        cipher.algorithm,
        payloadType,
        sodium.to_base64(nonce),
        sodium.to_base64(ciphertext),
      ].join('.')
    }
    if (outputFormat === 'uint8array') {
      return concat(nonce, ciphertext)
    }
    return sodium.to_base64(concat(nonce, ciphertext))
  }
}

// --

export function decrypt(
  sodium: Sodium,
  input: Uint8Array,
  cipher: Cipher
): Uint8Array

export function decrypt(
  sodium: Sodium,
  input: string,
  cipher: Cipher,
  inputEncoding: 'base64'
): Uint8Array

export function decrypt(
  sodium: Sodium,
  input: string,
  cipher: Cipher,
  inputEncoding: EncodedCiphertextFormat
): unknown

export function decrypt(
  sodium: Sodium,
  input: string | Uint8Array,
  cipher: Cipher,
  inputEncoding?: 'base64' | EncodedCiphertextFormat
) {
  if (typeof input === 'string' && !inputEncoding) {
    throw new TypeError(
      'Missing required inputEncoding argument for string-encoded ciphertext'
    )
  }
  const payload = isUint8Array(input)
    ? input
    : inputEncoding === encodedCiphertextFormatV1
    ? input.split('.')
    : sodium.from_base64(input)

  if (payload[0] === 'v1' && payload[1] !== cipher.algorithm) {
    throw new Error(
      `Invalid algorithm: expected to decrypt ${cipher.algorithm}, but got ${payload[1]} instead.`
    )
  }

  if (cipher.algorithm === 'box') {
    const [nonce, ciphertext] = isUint8Array(payload)
      ? split(payload, sodium.crypto_box_NONCEBYTES)
      : [sodium.from_base64(payload[3]), sodium.from_base64(payload[4])]
    const plaintext = sodium.crypto_box_open_easy(
      ciphertext,
      nonce,
      cipher.publicKey,
      cipher.privateKey
    )
    return decodePayload(sodium, payload, plaintext)
  }

  if (cipher.algorithm === 'sealedBox') {
    const ciphertext = isUint8Array(payload)
      ? payload
      : sodium.from_base64(payload[3])
    const plaintext = sodium.crypto_box_seal_open(
      ciphertext,
      cipher.publicKey,
      cipher.privateKey
    )
    return decodePayload(sodium, payload, plaintext)
  }

  if (cipher.algorithm === 'secretBox') {
    const [nonce, ciphertext] = isUint8Array(payload)
      ? split(payload, sodium.crypto_secretbox_NONCEBYTES)
      : [sodium.from_base64(payload[3]), sodium.from_base64(payload[4])]
    const plaintext = sodium.crypto_secretbox_open_easy(
      ciphertext,
      nonce,
      cipher.key
    )
    return decodePayload(sodium, payload, plaintext)
  }
}

function decodePayload(
  sodium: Sodium,
  payload: Uint8Array | string[],
  plaintext: Uint8Array
): unknown {
  if (isUint8Array(payload)) {
    return plaintext
  }
  const payloadType = payload[2]
  if (payloadType === PayloadType.bin) {
    return plaintext
  }
  if (payloadType === PayloadType.txt) {
    return sodium.to_string(plaintext)
  }
  if (payloadType === PayloadType.num) {
    return ieee754BytesToNumber(plaintext)
  }
  if (payloadType === PayloadType.bool) {
    return byteToBool(plaintext)
  }
  if (payloadType === PayloadType.json) {
    return JSON.parse(sodium.to_string(plaintext).trim())
  }
  throw new Error(`Unknown payload type ${payloadType}`)
}

// Higher-level interfaces --

export function encryptObject<Object extends object>(
  sodium: Sodium,
  input: Object,
  cipher: CipherWithOptionalNonce
) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (!isEncryptable(value)) {
        return [key, value]
      }
      try {
        return [key, encrypt(sodium, value, cipher, encodedCiphertextFormatV1)]
      } catch {
        return [key, value]
      }
    })
  )
}

export function decryptObject<Object extends object>(
  sodium: Sodium,
  input: Object,
  cipher: Cipher
) {
  type ObjectDecryptionError = {
    key: string
    error: string
  }
  const errors: ObjectDecryptionError[] = []
  const result = Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      try {
        return [key, decrypt(sodium, value, cipher)]
      } catch (error) {
        errors.push({
          key,
          error: String(error),
        })
        return [key, value]
      }
    })
  )
  if (errors.length) {
    console.error(errors)
  }
  return result
}
