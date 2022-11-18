import type { Sodium } from './sodium'

export function hashItems(sodium: Sodium, ...items: Uint8Array[]) {
  const hashState = sodium.crypto_generichash_init(
    null,
    sodium.crypto_hash_BYTES
  )
  items.forEach((item) => sodium.crypto_generichash_update(hashState, item))
  return sodium.crypto_generichash_final(hashState, sodium.crypto_hash_BYTES)
}

export function fingerprint(sodium: Sodium, input: string | Uint8Array) {
  return sodium.crypto_generichash(32, input, null, 'base64')
}
