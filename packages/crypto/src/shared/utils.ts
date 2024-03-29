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
  return input instanceof Uint8Array
}

/**
 * When receiving separate public & private signature keys,
 * make sure they match.
 *
 * In Ed25519, the public key is located in the right-most
 * 32 bytes of the private key.
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
