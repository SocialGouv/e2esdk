import { hash as blake2b } from '@stablelib/blake2b'
import tweetnacl from 'tweetnacl'
import {
  base64UrlEncode,
  boolToByte,
  numberToIEEE754Bytes,
} from './shared/codec'

// --

export function sealBytes(input: Uint8Array, publicKey: Uint8Array) {
  const ciphertext = _seal(input, publicKey)
  return ['v1', 'sealedBox', 'bin', base64UrlEncode(ciphertext)].join('.')
}

export function sealString(input: string, publicKey: Uint8Array) {
  const cleartext = new TextEncoder().encode(input)
  const ciphertext = _seal(cleartext, publicKey)
  return ['v1', 'sealedBox', 'txt', base64UrlEncode(ciphertext)].join('.')
}

export function sealNumber(input: number, publicKey: Uint8Array) {
  const cleartext = numberToIEEE754Bytes(input)
  const ciphertext = _seal(cleartext, publicKey)
  return ['v1', 'sealedBox', 'num', base64UrlEncode(ciphertext)].join('.')
}

export function sealBoolean(input: boolean, publicKey: Uint8Array) {
  const cleartext = boolToByte(input)
  const ciphertext = _seal(cleartext, publicKey)
  return ['v1', 'sealedBox', 'bool', base64UrlEncode(ciphertext)].join('.')
}

export function sealJSON<T>(input: T, publicKey: Uint8Array) {
  const cleartext = new TextEncoder().encode(JSON.stringify(input))
  const ciphertext = _seal(cleartext, publicKey)
  return ['v1', 'sealedBox', 'json', base64UrlEncode(ciphertext)].join('.')
}

// --

export function _seal(input: Uint8Array, publicKey: Uint8Array) {
  const ephemeralKeyPair = tweetnacl.box.keyPair()

  // Compute nonce as blake2b(ephemeral_pubKey || recipient_pubKey)
  const nonceInput = new Uint8Array(2 * publicKey.byteLength)
  nonceInput.set(ephemeralKeyPair.publicKey)
  nonceInput.set(publicKey, ephemeralKeyPair.publicKey.byteLength)
  const nonce = blake2b(nonceInput, tweetnacl.box.nonceLength)

  const ciphertext = tweetnacl.box(
    input,
    nonce,
    publicKey,
    ephemeralKeyPair.secretKey
  )
  // Output is ephemeral_pubKey || ciphertext
  const out = new Uint8Array(
    ephemeralKeyPair.publicKey.byteLength + ciphertext.byteLength
  )
  out.set(ephemeralKeyPair.publicKey)
  out.set(ciphertext, ephemeralKeyPair.publicKey.byteLength)
  return out
}
