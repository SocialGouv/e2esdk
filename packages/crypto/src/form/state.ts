import { thirtyTwoBytesBase64Schema } from '@socialgouv/e2esdk-api'
import type { KeyPair } from 'libsodium-wrappers'
import { base64UrlDecode, base64UrlEncode } from '../shared/codec'
import { Sodium, sodium } from '../sodium/sodium'

/**
 * Form encryption works using the combination of the following
 * cryptographic primitives:
 * - Public key cryptography
 * - Sealed box pattern
 * - Key derivation
 * - Symmetric encryption
 * - Digital signature
 *
 * A form is represented using a pair of public/private keys.
 * The form recipient(s) own the private key, and the public key is distributed
 * to clients.
 *
 * To encrypt a set of form data (response), a client will generate a local
 * state (this object), which consists of a random `mainSecret`, and from it
 * will derive a few elements:
 * - An identity key pair to sign and authenticate responses
 * - Another key derivation base secret
 *
 * When encrypting form data, each data point is encrypted using a symmetric
 * key derived from the `keyDerivationSecret`, and the whole thing is
 * authenticated via a digital signature.
 *
 * Allowing clients to persist their local state enables edition,
 * letting a client resume their work by retrieving already encrypted data,
 * deriving the necessary keys to decrypt it and hydrate the form UI.
 *
 * * Note: a form "state" does not contain form field data, only the cryptographic
 * secrets required to encrypt data provided by a user, or decrypt data coming
 * from the server for edition.
 */
export type EncryptedFormLocalState = {
  sodium: Sodium

  /**
   * SealedBoxCipher public key to encrypt form responses
   */
  formPublicKey: Uint8Array

  /**
   * Random
   */
  mainSecret: Uint8Array

  /**
   * Derived from the mainSecret, used as a base to further derive
   * symmetric encryption keys.
   */
  keyDerivationSecret: Uint8Array

  /**
   * The first 8 characters of the base64url encoding of the `formPublicKey`
   */
  keyDerivationContext: string

  /**
   * Signature key pair to authenticate response submissions
   */
  identity: Omit<KeyPair, 'keyType'>
}

const storageKey = (namespace: string) => `e2esdk:forms:localState:${namespace}`

function checkEnvironmentIsBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('Form local state cannot be initialized on the server.')
  }
}

function retrievePublicKeyFromURLHash() {
  checkEnvironmentIsBrowser()
  return thirtyTwoBytesBase64Schema
    .transform(base64UrlDecode)
    .parse(window.location.hash.replace(/^#/, ''))
}

/**
 * Generate a form local state from scratch
 *
 * This will generate a random mainSecret and derive the state from it.
 * Use it when starting a fresh set of responses, not when trying to edit
 * or amend an existing response.
 *
 * @param formPublicKey The public key of the form to seal for.
 *   If unspecified, it will be read from the hash part of the URL
 *   (eg: https://example.com/form#gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE)
 * @returns A Promise to`EncryptedFormLocalState` to encrypt form datas
 */
export async function generateEncryptedFormLocalState(
  formPublicKey: Uint8Array = retrievePublicKeyFromURLHash()
): Promise<EncryptedFormLocalState> {
  await sodium.ready
  const mainSecret = sodium.crypto_kdf_keygen()
  return deriveState(sodium, mainSecret, formPublicKey)
}

/**
 * Initalize a form local state
 *
 * This will attempt to hydrate an existing persisted local state, and fallback
 * to generating a new one if none exists.
 *
 * Use the `namespace` parameter to specify where to look for a persisted state.
 * For forms where a unique editable response per client is desired,
 * this can be made constant.
 *
 * For forms where multiple editable responses are desired, passing a unique
 * namespace (eg: UUID) allows persisting several states in parallel.
 *
 * @param namespace A key to specify where to load the state from in localStorage
 * @param formPublicKey The public key of the form to seal for
 *   If unspecified, it will be read from the hash part of the URL
 *   (eg: https://example.com/form#gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE)
 * @returns A Promise to `EncryptedFormLocalState` to encrypt form datas
 *
 * Note: a form "state" does not contain form data, only the cryptographic
 * secrets required to encrypt data provided by a user, or decrypt data coming
 * from the server for edition.
 */
export async function initializeEncryptedFormLocalState(
  namespace: string,
  formPublicKey: Uint8Array = retrievePublicKeyFromURLHash()
): Promise<EncryptedFormLocalState> {
  checkEnvironmentIsBrowser()
  try {
    await sodium.ready
    const serializedMainSecret = window.localStorage.getItem(
      storageKey(namespace)
    )
    if (!serializedMainSecret) {
      throw new Error('No main secret to load, generating a new state')
    }
    const mainSecret = base64UrlDecode(serializedMainSecret)
    return deriveState(sodium, mainSecret, formPublicKey)
  } catch {
    return generateEncryptedFormLocalState(formPublicKey)
  }
}

/**
 * Save a form state to localStorage for later retrieval for edition.
 *
 * @param state The form state to persist
 * @param namespace A key to specify where to save the state in localStorage
 *
 * Note: a form "state" does not contain form data, only the cryptographic
 * secrets required to encrypt data provided by a user, or decrypt data coming
 * from the server for edition.
 */
export function persistEncryptedFormLocalState(
  state: EncryptedFormLocalState,
  namespace: string
) {
  if (typeof window !== 'object') {
    return
  }
  window.localStorage.setItem(
    storageKey(namespace),
    // Only the mainSecret is saved,
    // as everything else can be derived from it.
    base64UrlEncode(state.mainSecret)
  )
}

/**
 * Remove a form state from localStorage, to prevent further edition.
 *
 * @param namespace A key to specify where to find the state in localStorage
 *
 * Note: a form "state" does not contain form data, only the cryptographic
 * secrets required to encrypt data provided by a user, or decrypt data coming
 * from the server for edition.
 */
export function clearEncryptedFormLocalState(namespace: string) {
  if (typeof window !== 'object') {
    return
  }
  window.localStorage.removeItem(storageKey(namespace))
}

// --

function deriveState(
  sodium: Sodium,
  mainSecret: Uint8Array,
  formPublicKey: Uint8Array
): EncryptedFormLocalState {
  // The intermediate key (IK) is used to fuse the mainSecret
  // and the form public key together before performing further
  // key derivations. If for some reason the same mainSecret
  // was used for different forms (different public keys),
  // the derived state would be different.
  const intermediateKey = sodium.crypto_generichash(
    sodium.crypto_kdf_KEYBYTES,
    formPublicKey,
    mainSecret
  )
  // Derive a seed to generate an Ed25519 signature key pair from the IK
  const seed = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_sign_SEEDBYTES,
    0,
    'formidkp', // form ID key pair
    intermediateKey
  )
  // Why not use the IK as the keyDerivationSecret (kDS) directly?
  // If somehow an attacker was able to reverse the derivation
  // process to obtain the kDS, they'd also be able to derive the
  // signature keypair, allowing forging responses. Having an extra
  // layer of key derivation gives each item a single purpose.
  const keyDerivationSecret = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_kdf_KEYBYTES,
    0,
    'formkdfs', // form key derivation function secret
    intermediateKey
  )
  const { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(seed)
  // Cleanup
  sodium.memzero(intermediateKey)
  sodium.memzero(seed)
  // While we could do this operation when we need the kDC,
  // it would be wasteful, so we precompute it and cache it here.
  const keyDerivationContext = sodium.to_base64(formPublicKey).slice(0, 8)
  return {
    sodium,
    formPublicKey,
    mainSecret,
    keyDerivationSecret,
    keyDerivationContext,
    identity: {
      publicKey,
      privateKey,
    },
  }
}
