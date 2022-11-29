import type { KeyPair } from 'libsodium-wrappers'
import {
  multipartSignature,
  verifyMultipartSignature,
} from './multipartSignature'
import type { Sodium } from './sodium'

export function generateMainKey(sodium: Sodium) {
  return sodium.crypto_kdf_keygen()
}

// --

type ClientIdentity = {
  userId: string
  personalKey: Uint8Array
  sharing: Omit<KeyPair, 'keyType'>
  signature: Omit<KeyPair, 'keyType'>
  proof: string
}

const KDF_DOMAIN = 'e2esdkid'

/**
 * Derive identity keys from user ID and a high-entropy main key.
 *
 * ### Algorithm
 *
 * Let's start from the end. We want to produce:
 * - An Ed25519 signature key pair
 * - An X25519 encryption (box) key pair
 * - A XChaCha20-Poly1305 (secretbox) symmetric key
 *
 * Those have to be derived deterministically from the input parameters,
 * userId and mainKey.
 *
 * We will assume mainKey has high-entropy, and was generated from a strong CSPRNG.
 * We assume the userId to be a low-entropy UTF-8 string, not user-provided
 * but coming from a database primary key column for example (UUID, CUID).
 *
 * To avoid cases where two different userIds have the same mainKey
 * (for some reason), we first produce an intermediate key from which
 * the output key material will be derived.
 *
 * To produce that key, we will compute a keyed hash of the mainKey.
 * Using the userId directly as the key for the keyed hash is not recommended,
 * as we have no control over `userId.length`.
 *
 * Therefore, we start by pre-hashing the userId into a format suitable to
 * serve as a hash key.
 *
 * From the intermediate key, we then derive seed material for generating the
 * two key pairs, and derive a symmetric secret key.
 * All key derivations use the domain string `e2esdkid`.
 */
export function deriveClientIdentity(
  sodium: Sodium,
  userId: string,
  mainKey: Uint8Array
): ClientIdentity {
  const userIdHash = sodium.crypto_generichash(
    sodium.crypto_generichash_KEYBYTES,
    userId,
    null
  )
  const intermediateKey = sodium.crypto_generichash(
    sodium.crypto_kdf_KEYBYTES,
    mainKey,
    userIdHash
  )
  const signatureSeed = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_sign_SEEDBYTES,
    0,
    KDF_DOMAIN,
    intermediateKey
  )
  const sharingSeed = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_box_SEEDBYTES,
    1,
    KDF_DOMAIN,
    intermediateKey
  )
  const personalKey = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_secretbox_KEYBYTES,
    2,
    KDF_DOMAIN,
    intermediateKey
  )
  const signature = sodium.crypto_sign_seed_keypair(signatureSeed)
  const sharing = sodium.crypto_box_seed_keypair(sharingSeed)
  sodium.memzero(userIdHash)
  sodium.memzero(intermediateKey)
  sodium.memzero(signatureSeed)
  sodium.memzero(sharingSeed)
  return {
    userId,
    personalKey,
    sharing: {
      publicKey: sharing.publicKey,
      privateKey: sharing.privateKey,
    },
    signature: {
      publicKey: signature.publicKey,
      privateKey: signature.privateKey,
    },
    proof: sodium.to_base64(
      multipartSignature(
        sodium,
        signature.privateKey,
        sodium.from_string(userId),
        sharing.publicKey
        // No need to specify signature.publicKey,
        // Ed25519 already includes it in the calculation.
        // (exclusive ownership)
      )
    ),
  }
}

type VerifyClientIdentityClaims = {
  userId: string
  sharingPublicKey: string
  signaturePublicKey: string
  proof: string
}

export function verifyClientIdentity(
  sodium: Sodium,
  claims: VerifyClientIdentityClaims
) {
  return verifyMultipartSignature(
    sodium,
    sodium.from_base64(claims.signaturePublicKey),
    sodium.from_base64(claims.proof),
    sodium.from_string(claims.userId),
    sodium.from_base64(claims.sharingPublicKey)
  )
}
