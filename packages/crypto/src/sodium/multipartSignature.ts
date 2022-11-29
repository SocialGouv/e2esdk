import { generateManifest } from './manifest'
import type { Sodium } from './sodium'

export function generateSignatureKeyPair(sodium: Sodium) {
  return sodium.crypto_sign_keypair()
}

/**
 * Calculate a multipart detached signature of multiple elements.
 *
 * Use `verifyMultipartSignature` for verification.
 *
 * Algorithm: Ed25519ph, with prepended manifest (see `generateManifest`)
 *
 * @param privateKey Signature private key
 * @param items Buffers to include in the calculation
 */
export function multipartSignature(
  sodium: Sodium,
  privateKey: Uint8Array,
  ...items: Uint8Array[]
) {
  const state = assembleMultipartSignatureState(sodium, items)
  return sodium.crypto_sign_final_create(state, privateKey)
}

/**
 * Verify integrity and provenance of a set of items, by verifying the signature
 * of the hash of those items.
 *
 * @param publicKey Signature public key
 * @param signature As returned by `multipartSignature`
 * @param items Items to verify
 */
export function verifyMultipartSignature(
  sodium: Sodium,
  publicKey: Uint8Array,
  signature: Uint8Array,
  ...items: Uint8Array[]
) {
  const state = assembleMultipartSignatureState(sodium, items)
  return sodium.crypto_sign_final_verify(state, signature, publicKey)
}

// Internal --

function assembleMultipartSignatureState(sodium: Sodium, items: Uint8Array[]) {
  const state = sodium.crypto_sign_init()
  // Include a representation of the structure of the input items (manifest)
  // as the first element, to prevent canonicalisation attacks:
  const manifest = generateManifest(items)
  sodium.crypto_sign_update(state, manifest)
  sodium.memzero(manifest)
  // Then add each item to the internal hash
  items.forEach(item => sodium.crypto_sign_update(state, item))
  return state
}
