import { SecretBoxCipher } from './ciphers'
import { encrypt } from './encryption'
import { Sodium } from './sodium'

export const DEFAULT_FILE_CHUNK_SIZE = 4096

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

export async function encryptFile(
  sodium: Sodium,
  file: File,
  cipher: SecretBoxCipher,
  chunkSize = DEFAULT_FILE_CHUNK_SIZE
): Promise<File> {
  const ciphertextBuffer = await encryptFileContents(
    sodium,
    file,
    cipher,
    chunkSize
  )
  const encryptedName = encrypt(
    sodium,
    file.name,
    cipher,
    'application/e2esdk.ciphertext.v1'
  )
  return new File([ciphertextBuffer], encryptedName, {
    type: file.type,
    lastModified: file.lastModified,
  })
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
