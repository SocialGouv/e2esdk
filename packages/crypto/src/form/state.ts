import { thirtyTwoBytesBase64Schema } from '@socialgouv/e2esdk-api'
import type { KeyPair } from 'libsodium-wrappers'
import { base64UrlDecode, base64UrlEncode } from '../shared/codec'
import { Sodium, sodium } from '../sodium/sodium'

export const keyDerivationSecretSchema =
  thirtyTwoBytesBase64Schema.transform(base64UrlDecode)

export type EncryptedFormLocalState = {
  sodium: Sodium
  formPublicKey: Uint8Array
  mainSecret: Uint8Array
  keyDerivationSecret: Uint8Array
  keyDerivationContext: string
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
  return keyDerivationSecretSchema.parse(window.location.hash.replace(/^#/, ''))
}

/**
 * Generate form local state
 * @param formPublicKey The public key of the form to seal for
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
 * @param namespace The form namespace
 * @param [formPublicKey] The public key of the form to seal for
 * @returns A Promise to `EncryptedFormLocalState` to encrypt form datas
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
    return generateEncryptedFormLocalState()
  }
}

export function persistEncryptedFormLocalState(
  state: EncryptedFormLocalState,
  namespace: string
) {
  if (typeof window !== 'object') {
    return
  }
  window.localStorage.setItem(
    storageKey(namespace),
    base64UrlEncode(state.mainSecret)
  )
}

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
  const intermediateKey = sodium.crypto_generichash(
    sodium.crypto_kdf_KEYBYTES,
    formPublicKey,
    mainSecret
  )
  const seed = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_sign_SEEDBYTES,
    0,
    'formidkp',
    intermediateKey
  )
  const keyDerivationSecret = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_kdf_KEYBYTES,
    0,
    'formkdfs',
    intermediateKey
  )
  const { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(seed)
  sodium.memzero(intermediateKey)
  sodium.memzero(seed)
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
