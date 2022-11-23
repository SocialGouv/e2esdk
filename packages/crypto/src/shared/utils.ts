import type { Sodium } from '../sodium/sodium'

export function concat(...items: Uint8Array[]) {
  const buffer = new Uint8Array(
    items.reduce((sum, item) => sum + item.length, 0)
  )
  let index = 0
  items.forEach(item => {
    buffer.set(item, index)
    index += item.length
  })
  return buffer
}

export function split(buffer: Uint8Array, splitPoint: number) {
  const a = buffer.slice(0, splitPoint)
  const b = buffer.slice(splitPoint)
  return [a, b]
}

export function isUint8Array(input: any): input is Uint8Array {
  return typeof input?.byteLength === 'number'
}

export function isEncryptable(
  value: any
): value is Uint8Array | string | number | boolean {
  return (
    ['string', 'number', 'boolean'].includes(typeof value) ||
    isUint8Array(value)
  )
}

/**
 * When receiving one of our own signature public keys from a server,
 * make sure it matches our associated private key.
 *
 * In Ed25519, the public key is located in the
 * right-most 32 bytes of the private key:
 *
 * @param publicKey The public key received from the outside
 * @param privateKey The associated private key
 */
export function checkSignaturePublicKey(
  sodium: Sodium,
  publicKey: Uint8Array,
  privateKey: Uint8Array
) {
  const embeddedPublicKey = privateKey.slice(32)
  return sodium.compare(embeddedPublicKey, publicKey) === 0
}

/**
 * When receiving one of our own encryption public keys from a server,
 * make sure it matches our associated private key.
 *
 * Works on Sodium box key pairs generated with `sodium.crypto_box_keypair()`.
 *
 * @param publicKey The public key received from the outside
 * @param privateKey The associated private key
 */
export function checkEncryptionPublicKey(
  sodium: Sodium,
  publicKey: Uint8Array,
  privateKey: Uint8Array
) {
  const derivedPublicKey = sodium.crypto_scalarmult_base(privateKey)
  return sodium.compare(derivedPublicKey, publicKey) === 0
}

/**
 * Apply padding randomly around a string to ensure a constant output length.
 *
 * Example, to pad the input "Hello, world!" to an output of 20,
 * there are 20 - 13 = 7 characters to add.
 * We could have 4 at the beginning and 3 at the end,
 * or 2 at the beginning and 5 at the end, etc..
 * The cutoff point is decided randomly.
 *
 * @param input The input string to pad
 * @param outputLength The desired output length
 * @param paddingChar The character to use for padding (defaults to a ` ` space character)
 */
export function randomPad(
  input: string,
  outputLength: number,
  paddingChar = ' '
) {
  const padSize = outputLength - input.length
  if (padSize <= 0) {
    return input
  }
  const padStart = Math.round(Math.random() * padSize)
  const padEnd = padSize - padStart
  return input
    .padStart(outputLength - padEnd, paddingChar)
    .padEnd(outputLength, paddingChar)
}

export function numberToIEEE754Bytes(input: number) {
  const buffer = new ArrayBuffer(8)
  const f64 = new Float64Array(buffer)
  f64[0] = input
  return new Uint8Array(buffer)
}

export function ieee754BytesToNumber(bytes: Uint8Array) {
  if (bytes.byteLength !== 8) {
    return NaN
  }
  const f64 = new Float64Array(bytes.buffer)
  return f64[0]
}

export function boolToByte(input: boolean) {
  const byte = new Uint8Array(1)
  crypto.getRandomValues(byte)
  if (input) {
    byte[0] |= 0x01 // set LSB
  } else {
    byte[0] &= 0xfe // clear LSB
  }
  return byte
}

export function byteToBool(byte: Uint8Array) {
  return Boolean(byte[0] & 0x01)
}
