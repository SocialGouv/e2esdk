import {
  sealedBoxCiphertextV1Schema,
  signatureSchema,
  thirtyTwoBytesBase64Schema,
} from '@e2esdk/api'
import { z } from 'zod'
import { SealedBoxCipher, SecretBoxCipher } from '../sodium/ciphers'
import { decrypt, encrypt } from '../sodium/encryption'
import {
  multipartSignature,
  verifyMultipartSignature,
} from '../sodium/multipartSignature'
import { Sodium } from '../sodium/sodium'
import { EncryptedFormLocalState } from './state'

const encryptedFieldSchema = z
  .string()
  .regex(
    /^[0-7][0-9a-f]{7}:v1\.secretBox\.(bin|txt|num|bool|json)\.[\w-]{32}\.[\w-]{22,}$/
  )
  .transform(value => {
    const [context, ciphertext] = value.split(':')
    return {
      subkeyIndex: parseInt(context, 16),
      ciphertext,
    }
  })

const encryptedFormSubmissionMetadataSchema = z.object({
  sealedSecret: sealedBoxCiphertextV1Schema('bin'),
  signature: signatureSchema,
  publicKey: thirtyTwoBytesBase64Schema,
})

const encryptedFormSubmissionSchema = z.object({
  metadata: encryptedFormSubmissionMetadataSchema,
  encrypted: z.record(encryptedFieldSchema.nullish()),
})

export type EncryptedFormSubmission<FormData extends object> = {
  metadata: z.input<typeof encryptedFormSubmissionMetadataSchema>
  encrypted: {
    [Field in keyof FormData]: FormData[Field] extends undefined
      ? string | undefined
      : string
  }
}

// --

function sortedEntries(input: object) {
  return Object.entries(input).sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
}

export function encryptFormData<FormData extends object>(
  input: FormData,
  state: EncryptedFormLocalState
): EncryptedFormSubmission<FormData> {
  const keyDerivationContext = state.sodium
    .to_base64(state.formPublicKey)
    .slice(0, 8)
  const sealedBoxCipher: SealedBoxCipher = {
    algorithm: 'sealedBox',
    publicKey: state.formPublicKey,
    privateKey: new Uint8Array(0), // not used here
  }
  const encrypted: Record<string, string> = {}
  const hashState = state.sodium.crypto_generichash_init(
    state.formPublicKey,
    state.sodium.crypto_generichash_BYTES
  )
  for (const [field, cleartext] of sortedEntries(input)) {
    const subkeyIndex = state.sodium.randombytes_uniform(0x7fffffff)
    const subkeyIndexHex = subkeyIndex
      .toString(16)
      .padStart(8, '0')
      .toLowerCase()
    const cipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: state.sodium.crypto_kdf_derive_from_key(
        state.sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        keyDerivationContext,
        state.keyDerivationSecret
      ),
    }
    const ciphertext = encrypt(
      state.sodium,
      cleartext,
      cipher,
      'application/e2esdk.ciphertext.v1'
    )
    state.sodium.memzero(cipher.key)
    encrypted[field] = `${subkeyIndexHex}:${ciphertext}`
    state.sodium.crypto_generichash_update(hashState, encrypted[field])
  }
  const sealedSecret = encrypt(
    state.sodium,
    state.keyDerivationSecret,
    sealedBoxCipher,
    'application/e2esdk.ciphertext.v1'
  )
  state.sodium.crypto_generichash_update(hashState, sealedSecret)
  const signature = multipartSignature(
    state.sodium,
    state.identity.privateKey,
    state.formPublicKey,
    state.sodium.crypto_generichash_final(
      hashState,
      state.sodium.crypto_generichash_BYTES
    )
  )
  return {
    metadata: {
      sealedSecret,
      signature: state.sodium.to_base64(signature),
      publicKey: state.sodium.to_base64(state.identity.publicKey),
    },
    encrypted: encrypted as EncryptedFormSubmission<FormData>['encrypted'],
  }
}

export function decryptFormData<FormData extends object>(
  sodium: Sodium,
  submission: EncryptedFormSubmission<any>,
  cipher: SealedBoxCipher
) {
  // Verify signature first
  const hashState = sodium.crypto_generichash_init(
    cipher.publicKey,
    sodium.crypto_generichash_BYTES
  )
  for (const [_, encryptedField] of sortedEntries(submission.encrypted)) {
    if (!encryptedField) {
      continue
    }
    sodium.crypto_generichash_update(hashState, encryptedField)
  }
  sodium.crypto_generichash_update(hashState, submission.metadata.sealedSecret)
  if (
    !verifyMultipartSignature(
      sodium,
      sodium.from_base64(submission.metadata.publicKey),
      sodium.from_base64(submission.metadata.signature),
      cipher.publicKey,
      sodium.crypto_generichash_final(
        hashState,
        sodium.crypto_generichash_BYTES
      )
    )
  ) {
    throw new Error('Failed to verify form submission signature')
  }
  // Parse and validate internal representation
  const sub = encryptedFormSubmissionSchema.parse(submission)
  // Unseal the key derivation secret
  const keyDerivationSecret = decrypt(
    sodium,
    sub.metadata.sealedSecret,
    cipher,
    'application/e2esdk.ciphertext.v1'
  ) as Uint8Array
  if (
    !(keyDerivationSecret instanceof Uint8Array) ||
    keyDerivationSecret.byteLength !== sodium.crypto_kdf_KEYBYTES
  ) {
    throw new TypeError('Invalid form submission secret')
  }
  const keyDerivationContext = sodium.to_base64(cipher.publicKey).slice(0, 8)
  const outputData: Record<string, unknown> = {}
  for (const [field, encryptedField] of Object.entries(sub.encrypted)) {
    if (!encryptedField) {
      continue
    }
    const cipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: sodium.crypto_kdf_derive_from_key(
        sodium.crypto_secretbox_KEYBYTES,
        encryptedField.subkeyIndex,
        keyDerivationContext,
        keyDerivationSecret
      ),
    }
    outputData[field] = decrypt(
      sodium,
      encryptedField.ciphertext,
      cipher,
      'application/e2esdk.ciphertext.v1'
    )
    sodium.memzero(cipher.key)
  }
  // Cleanup
  sodium.memzero(keyDerivationSecret)
  return outputData as Record<keyof FormData, unknown>
}
