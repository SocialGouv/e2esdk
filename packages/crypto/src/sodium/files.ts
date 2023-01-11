import { thirtyTwoBytesBase64Schema } from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { generateSecretBoxCipher, SecretBoxCipher } from './ciphers'
import { Sodium } from './sodium'

export const DEFAULT_FILE_CHUNK_SIZE = 4096

export const fileMetadataSchema = z.object({
  /** Original file name */
  name: z.string(),

  /** Timestamp of last modification */
  lastModified: z.number().int().positive(),

  /** MIME type */
  type: z.string(),

  /** SHA-512, hex-encoded */
  hash: z.string().regex(/^[0-9a-f]{128}$/i),

  /** Symmetric key to encrypt/decrypt file contents */
  key: thirtyTwoBytesBase64Schema,
})

export type FileMetadata = z.infer<typeof fileMetadataSchema>

// --

export async function encryptFileContents(
  sodium: Sodium,
  file: File,
  cipher: SecretBoxCipher,
  chunkSize = DEFAULT_FILE_CHUNK_SIZE
) {
  const chunkSizeBits = Math.log2(chunkSize)
  if (!Number.isSafeInteger(chunkSizeBits)) {
    throw new Error(
      `File encryption chunk size (${chunkSize}) must be a power of two`
    )
  }
  const numChunks = Math.ceil(file.size / chunkSize)
  const ciphertextLength =
    1 + // chunk size (number of bits)
    sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES +
    file.size +
    sodium.crypto_secretstream_xchacha20poly1305_ABYTES * numChunks
  const ciphertextBuffer = new Uint8Array(ciphertextLength)
  const { header, state } =
    sodium.crypto_secretstream_xchacha20poly1305_init_push(cipher.key)
  ciphertextBuffer[0] = chunkSizeBits
  ciphertextBuffer.set(header, 1)
  for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
    const tag =
      chunkIndex === numChunks - 1
        ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : 0
    const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(
      state,
      new Uint8Array(
        await file
          .slice(chunkSize * chunkIndex, chunkSize * (chunkIndex + 1))
          .arrayBuffer()
      ),
      null, // No additional data
      tag
    )
    ciphertextBuffer.set(
      ciphertext,
      1 +
        header.byteLength +
        chunkIndex *
          (chunkSize + sodium.crypto_secretstream_xchacha20poly1305_ABYTES)
    )
  }
  return ciphertextBuffer
}

export function decryptFileContents(
  sodium: Sodium,
  ciphertext: Uint8Array,
  cipher: SecretBoxCipher
) {
  const chunkSize = 1 << ciphertext[0]
  const ciphertextChunkSize =
    chunkSize + sodium.crypto_secretstream_xchacha20poly1305_ABYTES
  const numChunks = Math.ceil(
    (ciphertext.byteLength -
      1 -
      sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES) /
      ciphertextChunkSize
  )
  const clearTextSize =
    ciphertext.byteLength -
    1 -
    sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES -
    numChunks * sodium.crypto_secretstream_xchacha20poly1305_ABYTES
  const clearTextBuffer = new Uint8Array(clearTextSize)
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
    ciphertext.slice(
      1,
      1 + sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES
    ),
    cipher.key
  )
  for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
    const start =
      1 +
      sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES +
      chunkIndex * ciphertextChunkSize
    const end = start + ciphertextChunkSize
    const ciphertextSlice = ciphertext.slice(start, end)
    const clearText = sodium.crypto_secretstream_xchacha20poly1305_pull(
      state,
      ciphertextSlice
    )
    if (!clearText.message) {
      throw new Error('Failed to decrypt file')
    }
    clearTextBuffer.set(clearText.message, chunkIndex * chunkSize)
  }
  return clearTextBuffer
}

// --

/**
 * Generate a secret key and encrypt the file with it.
 *
 * The encrypted file name is the hash of the ciphertext,
 * and the encryption key is base64url-encoded into the
 * returned cleartext metadata, to be encrypted separately.
 */
export async function encryptFile(
  sodium: Sodium,
  file: File,
  chunkSize = DEFAULT_FILE_CHUNK_SIZE
) {
  // Validate & extract input file metadata
  const { name, type, lastModified } = fileMetadataSchema
    .pick({ name: true, type: true, lastModified: true })
    .parse(file)

  // File contents are encrypted with a dedicated symmetric key
  const cipher = generateSecretBoxCipher(sodium)
  const ciphertext = await encryptFileContents(sodium, file, cipher, chunkSize)

  // Libsodium.js unfortunately does not expose SHA-512,
  // but it's available in WebCrypto.
  const hash = sodium.to_hex(
    new Uint8Array(
      await window.crypto.subtle.digest({ name: 'SHA-512' }, ciphertext)
    )
  )
  const metadata: FileMetadata = {
    name,
    type,
    lastModified,
    hash,
    key: sodium.to_base64(cipher.key),
  }
  sodium.memzero(cipher.key)
  return {
    metadata,
    encryptedFile: new File([ciphertext], hash, {
      // Keep those in clear text as the server may have a use for it.
      type,
      lastModified,
    }),
  }
}
