import {
  sealedBoxCiphertextV1Schema,
  signatureSchema,
  thirtyTwoBytesBase64Schema,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { SealedBoxCipher, SecretBoxCipher } from '../sodium/ciphers'
import { decrypt, encrypt } from '../sodium/encryption'
import {
  multipartSignature,
  verifyMultipartSignature,
} from '../sodium/multipartSignature'
import { Sodium } from '../sodium/sodium'
import { EncryptedFormLocalState } from './state'

/**
 * Parser for the ciphertext of symmetrically encrypted form fields.
 *
 * Includes a context prefix and the ciphertext itself, separated with `:`
 * The context prefix is used in the key derivation function to obtain the
 * symmetric encryption key to decrypt the ciphertext.
 */
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

/**
 * Along with the encrypted form data, we need to send the server some extra
 * metadata to allow decryption, both by the form recipient(s) and the submitter
 * in the case of edition.
 */
const encryptedFormSubmissionMetadataSchema = z.object({
  /**
   * Key derivation secret encrypted with the form public key in a sealed box
   */
  sealedSecret: sealedBoxCiphertextV1Schema('bin'),

  /**
   * Digital signature of the hash of the encrypted items, for authentication.
   *
   * Note: this authentication only works if the whole dataset is available
   * for verification, therefore it's only relevant for server-side validation
   * of response submissions.
   * If a subset of the form data is to be decrypted, signature verification is
   * pointless, as not all the data is available to recompute the signed hash.
   */
  signature: signatureSchema,

  /**
   * Client form state identity public key, to verify the signature against.
   */
  publicKey: thirtyTwoBytesBase64Schema,
})

const encryptedFormSubmissionSchema = z.object({
  metadata: encryptedFormSubmissionMetadataSchema,
  encrypted: z.record(encryptedFieldSchema.nullish()),
})

export type EncryptedFormSubmission<FormData extends object> = {
  metadata: z.input<typeof encryptedFormSubmissionMetadataSchema>

  /**
   * The form data object keeps its properties when encrypted,
   * but each value becomes a string.
   * Optional properties remain optional in their encrypted counterparts.
   */
  encrypted: {
    [Field in keyof FormData]: FormData[Field] extends undefined
      ? string | undefined
      : string
  }
}

// --

/**
 * To get a stable hash, we need the enumeration of entries (key-value tuples)
 * to be stable. This sorts them by increasing lexicographic order of the keys.
 */
function sortedEntries(input: object) {
  return Object.entries(input).sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
}

/**
 * Encrypt form data against a given state
 *
 * This will perform the key derivation for each field,
 * encrypt it symmetrically (AEAD) using the resulting field encryption key,
 * with the field name as AAD to prevent key-value swaps.
 * Once a field is encrypted, its ciphertext is appended to a running hash
 * to compute the final authenticity signature.
 * Finally, the key derivation secret is sealed using the form public key,
 * and packed as metadata.
 *
 * @param input the form data to encrypt
 * @param state the client local state to use for encryption
 *
 * Note: this does not handle files as-is. To add files to a form submission,
 * their content must be encrypted and uploaded separately, and the
 * resulting file metadata (containing the name, size and encryption key)
 * must be placed in the input to be encrypted here.
 * This allows recipients to only obtain the metadata for review,
 * and choose to download and decrypt file contents on demand.
 */
export function encryptFormData<FormData extends object>(
  input: FormData,
  state: EncryptedFormLocalState
): EncryptedFormSubmission<FormData> {
  const sealedBoxCipher: SealedBoxCipher = {
    algorithm: 'sealedBox',
    publicKey: state.formPublicKey,
    privateKey: new Uint8Array(0), // not used here
  }
  const encrypted: Record<string, string> = {}
  // As we go over the fields to encrypt, we keep a running hash of
  // the generated ciphertexts, that will be signed at the end.
  const hashState = state.sodium.crypto_generichash_init(
    // Keying the hash by the public key may not be necessary,
    // but it further binds the signature of the submission.
    state.formPublicKey,
    state.sodium.crypto_generichash_BYTES
  )
  // Iteration over the input fields must be sorted to ensure the signature hash
  // is deterministic across runtimes or implementations.
  const entries = sortedEntries(input)
  for (const [field, cleartext] of entries) {
    // To derive keys from a single key/secret using libsodium,
    // we need a subkey index, which is a 32 bit unsigned integer.
    // However, since JavaScript encodes numbers as float64,
    // getting the whole range of unsigned 32 bits integers is not possible,
    // so we clamp the random range to 31 bits (0x7f ff ff ff)
    const subkeyIndex = state.sodium.randombytes_uniform(0x7fffffff)
    const cipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: state.sodium.crypto_kdf_derive_from_key(
        state.sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        state.keyDerivationContext,
        state.keyDerivationSecret
      ),
    }
    const ciphertext = encrypt(
      state.sodium,
      cleartext,
      cipher,
      // Note: we set the field name as additional data (AEAD)
      // in order to defend against an attacker who would swap
      // two field values.
      // While such an attack does invalidate the signature,
      // we cannot rely on a signature check when working with
      // a subset of the encrypted fields (eg: a collaborator with
      // reduced permissions may only have access to some fields).
      state.sodium.from_string(field),
      'application/e2esdk.ciphertext.v1'
    )
    state.sodium.memzero(cipher.key)
    // The subkey index is hex-encoded and prepended to the ciphertext
    // for later retrieval when decrypting (to derive the decryption key)
    const subkeyIndexHex = subkeyIndex
      .toString(16)
      .padStart(8, '0')
      .toLowerCase()
    encrypted[field] = `${subkeyIndexHex}:${ciphertext}`
    state.sodium.crypto_generichash_update(hashState, encrypted[field])
  }
  const sealedSecret = encrypt(
    state.sodium,
    state.keyDerivationSecret,
    sealedBoxCipher,
    null,
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
    null
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
    // Derive the symmetric decryption key based on the decrypted KDS,
    // the derived KDC from the public key, and the subkey index
    // encoded in the ciphertext prefix.
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
      // Field name is set as additional data, see the encryption note above.
      sodium.from_string(field)
    )
    sodium.memzero(cipher.key)
  }
  // Cleanup
  sodium.memzero(keyDerivationSecret)
  return outputData as Record<keyof FormData, unknown>
}
