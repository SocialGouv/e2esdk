import type { Sodium } from './sodium'

/**
 * Hash the concatenation of a list of buffers
 *
 * **Note:** this is a low-level construction, susceptible
 * to canonicalisation attacks if used on untrusted inputs.
 * Consider adding a manifest before hashing, see ./manifest.ts
 *
 * Algorithm: BLAKE2b, default parameters
 */
export function hashItems(sodium: Sodium, ...items: Uint8Array[]) {
  const hashState = sodium.crypto_generichash_init(
    null,
    sodium.crypto_hash_BYTES
  )
  items.forEach(item => sodium.crypto_generichash_update(hashState, item))
  return sodium.crypto_generichash_final(hashState, sodium.crypto_hash_BYTES)
}

export function fingerprint(sodium: Sodium, input: string | Uint8Array) {
  return sodium.crypto_generichash(32, input, null, 'base64')
}
