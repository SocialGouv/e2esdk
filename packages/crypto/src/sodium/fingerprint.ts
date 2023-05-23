import type { Sodium } from './sodium'

/**
 * Hash an input value into a constant-length output
 *
 * @param input Either a UTF8 encoded string or a buffer of bytes
 * @returns a base64url encoded string of the 32 byte hash of the input.
 *
 * Algorithm: BLAKE2b
 * Note: Because the underlying hash computation is very fast,
 * this technique should not be used on low-entropy inputs,
 * solely user-provided inputs, or inputs that can be enumerated somehow.
 */
export function fingerprint(sodium: Sodium, input: string | Uint8Array) {
  return sodium.crypto_generichash(32, input, null, 'base64')
}
