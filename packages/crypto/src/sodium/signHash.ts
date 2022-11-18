import { hashItems } from './hash'
import type { Sodium } from './sodium'

export function generateSignatureKeyPair(sodium: Sodium) {
  return sodium.crypto_sign_keypair()
}

/**
 * Calculate the hash of the given items, sign it and return the detached signature.
 *
 * Use `verifySignedHash` for verification.
 *
 * @param privateKey Signature private key
 * @param items Items to include in the calculation (concatenated before hashing)
 */
export function signHash(
  sodium: Sodium,
  privateKey: Uint8Array,
  ...items: Uint8Array[]
) {
  const hash = hashItems(sodium, ...items)
  return sodium.crypto_sign_detached(hash, privateKey)
}

/**
 * Verify integrity and provenance of a set of items, by verifying the signature
 * of the hash of those items.
 *
 * @param publicKey Signature public key
 * @param signature As returned by `signHash`
 * @param items Items to verify
 */
export function verifySignedHash(
  sodium: Sodium,
  publicKey: Uint8Array,
  signature: Uint8Array,
  ...items: Uint8Array[]
) {
  const hash = hashItems(sodium, ...items)
  return sodium.crypto_sign_verify_detached(signature, hash, publicKey)
}
