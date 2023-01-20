import { PayloadType } from '@socialgouv/e2esdk-api'
import type { Uint8ArrayOutputFormat } from 'libsodium-wrappers'
import secureJSON from 'secure-json-parse'
import {
  boolToBytes,
  bytesToBool,
  ieee754BytesToNumber,
  numberToIEEE754Bytes,
} from '../shared/codec'
import { concat, isUint8Array, split } from '../shared/utils'
import type { Cipher } from './ciphers'
import type { Sodium } from './sodium'

// --

export const encodedCiphertextFormatV1 = 'application/e2esdk.ciphertext.v1'
export type EncodedCiphertextFormat = typeof encodedCiphertextFormatV1

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
export function encrypt<DataType>(
  sodium: Sodium,
  input: DataType,
  cipher: CipherWithOptionalNonce,
  additionalData?: null | Uint8Array,
  outputFormat?: EncodedCiphertextFormat
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
  additionalData?: null | Uint8Array,
  outputFormat?: Uint8ArrayOutputFormat
): Uint8Array

export function encrypt<DataType>(
  sodium: Sodium,
  input: DataType,
  cipher: CipherWithOptionalNonce,
  additionalData?: null | Uint8Array,
  outputFormat:
    | Uint8ArrayOutputFormat
    | EncodedCiphertextFormat = encodedCiphertextFormatV1
) {
  if (additionalData && cipher.algorithm !== 'secretBox') {
    throw new Error('Additional data is only supported with secretBox ciphers')
  }

  const { payloadType, payload } = isUint8Array(input)
    ? {
        payloadType: PayloadType.buffer,
        payload: input,
      }
    : typeof input === 'string'
    ? {
        payloadType: PayloadType.string,
        payload: sodium.from_string(input),
      }
    : typeof input === 'number'
    ? {
        payloadType: PayloadType.number,
        payload: numberToIEEE754Bytes(input),
      }
    : typeof input === 'boolean'
    ? {
        payloadType: PayloadType.boolean,
        payload: boolToBytes(input),
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
    const ciphertext = additionalData
      ? sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          payload,
          additionalData ?? null,
          null, // nsec is not used in this particular construction
          nonce,
          cipher.key
        )
      : sodium.crypto_secretbox_easy(payload, nonce, cipher.key)
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
  cipher: Cipher,
  additionalData?: null | Uint8Array
): Uint8Array

export function decrypt(
  sodium: Sodium,
  input: string,
  cipher: Cipher,
  additionalData?: null | Uint8Array
): unknown

export function decrypt(
  sodium: Sodium,
  input: string | Uint8Array,
  cipher: Cipher,
  additionalData?: null | Uint8Array
) {
  const payload = isUint8Array(input) ? input : input.split('.')
  if (payload[0] === 'v1' && payload[1] !== cipher.algorithm) {
    throw new Error(
      `Invalid algorithm: expected to decrypt ${cipher.algorithm}, but got ${payload[1]} instead.`
    )
  }
  if (additionalData && cipher.algorithm !== 'secretBox') {
    throw new Error('Additional data is only supported with secretBox ciphers')
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
    const plaintext = additionalData
      ? sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          ciphertext,
          additionalData,
          nonce,
          cipher.key
        )
      : sodium.crypto_secretbox_open_easy(ciphertext, nonce, cipher.key)
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
  if (payloadType === PayloadType.buffer) {
    return plaintext
  }
  if (payloadType === PayloadType.string) {
    return sodium.to_string(plaintext)
  }
  if (payloadType === PayloadType.number) {
    return ieee754BytesToNumber(plaintext)
  }
  if (payloadType === PayloadType.boolean) {
    return bytesToBool(plaintext)
  }
  if (payloadType === PayloadType.json) {
    return secureJSON.parse(sodium.to_string(plaintext).trim())
  }
  throw new Error(`Unknown payload type ${payloadType}`)
}
