import { thirtyTwoBytesHexSchema } from '@socialgouv/e2esdk-api'
import { decode as decodeHex, encode as hexEncode } from '@stablelib/hex'
import { z } from 'zod'
import { Sodium } from './sodium'

export type BoxCipher<DataType = Uint8Array> = {
  algorithm: 'box'
  publicKey: DataType
  privateKey: DataType
}

export type SealedBoxCipher<DataType = Uint8Array> = {
  algorithm: 'sealedBox'
  publicKey: DataType
  privateKey: DataType
}

export type SecretBoxCipher<DataType = Uint8Array> = {
  algorithm: 'secretBox'
  key: DataType
}

export type Cipher = BoxCipher | SealedBoxCipher | SecretBoxCipher

// Factories --

/**
 * Generate an asymetric key pair for encryption, to be used with LibSodium's box cipher
 * _(X25519-XSalsa20-Poly1305)_
 */
export function generateBoxKeyPair(sodium: Sodium) {
  const { publicKey, privateKey } = sodium.crypto_box_keypair()
  return { publicKey, privateKey }
}

/**
 * Pack a Cipher object for two users using asymetric keys.
 *
 * This would allow user-to-user communications, using your own private key
 * and a recipient's public key.
 */
export function generateBoxCipher(
  theirPublicKey: Uint8Array,
  yourPrivateKey: Uint8Array
): BoxCipher {
  return {
    algorithm: 'box',
    publicKey: theirPublicKey,
    privateKey: yourPrivateKey,
  }
}

/**
 * Generate a Cipher object using the sealed box pattern, to allow
 * anonymous ephemeral communication with a known recipient.
 *
 * This would be used to ingest encrypted data from anonymous users
 * (ie: without an e2esdk user identity) using a Box
 *
 */
export function generateSealedBoxCipher(sodium: Sodium): SealedBoxCipher {
  const keyPair = sodium.crypto_box_keypair()
  return {
    algorithm: 'sealedBox',
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }
}

/**
 * Generate a Cipher object for symetric encryption.
 */
export function generateSecretBoxCipher(sodium: Sodium): SecretBoxCipher {
  return {
    algorithm: 'secretBox',
    key: sodium.crypto_secretbox_keygen(),
  }
}

// Serializer --

export const CIPHER_MAX_PADDED_LENGTH = 190

/**
 * @warning This will not encrypt the keys, they will only be hex-encoded.
 * This should only be used to feed to the `encrypt` function.
 */
export function serializeCipher(cipher: Cipher) {
  if (cipher.algorithm === 'box') {
    const payload: Omit<BoxCipher<string>, 'nonce'> = {
      algorithm: cipher.algorithm,
      publicKey: hexEncode(cipher.publicKey),
      privateKey: hexEncode(cipher.privateKey),
    }
    return JSON.stringify(payload)
  }
  if (cipher.algorithm === 'sealedBox') {
    const payload: SealedBoxCipher<string> = {
      algorithm: cipher.algorithm,
      publicKey: hexEncode(cipher.publicKey),
      privateKey: hexEncode(cipher.privateKey),
    }
    return JSON.stringify(payload)
  }
  if (cipher.algorithm === 'secretBox') {
    const payload: Omit<SecretBoxCipher<string>, 'nonce'> = {
      algorithm: cipher.algorithm,
      key: hexEncode(cipher.key),
    }
    return JSON.stringify(payload)
  }
  throw new Error('Unsupported cipher algorithm')
}

// Parsers --

const thirtyTwoBytesInHexParser = thirtyTwoBytesHexSchema.transform(decodeHex)

export const boxCipherParser = z.object({
  algorithm: z.literal('box'),
  publicKey: thirtyTwoBytesInHexParser,
  privateKey: thirtyTwoBytesInHexParser,
})

export const sealedBoxCipherParser = z.object({
  algorithm: z.literal('sealedBox'),
  publicKey: thirtyTwoBytesInHexParser,
  privateKey: thirtyTwoBytesInHexParser,
})

export const secretBoxCipherParser = z.object({
  algorithm: z.literal('secretBox'),
  key: thirtyTwoBytesInHexParser,
})

export const cipherParser = z.discriminatedUnion('algorithm', [
  boxCipherParser,
  sealedBoxCipherParser,
  secretBoxCipherParser,
])

export function isBoxCipher(cipher: Cipher): cipher is BoxCipher {
  return boxCipherParser.safeParse(cipher).success
}

export function isSealedBoxCipher(cipher: Cipher): cipher is SealedBoxCipher {
  return sealedBoxCipherParser.safeParse(cipher).success
}

export function isSecretBoxCipher(cipher: Cipher): cipher is SecretBoxCipher {
  return secretBoxCipherParser.safeParse(cipher).success
}

// Utility --

/**
 * Zero-fill the secret parts of Cipher objects.
 *
 * It's always a good idea to call this right after being done with a Cipher,
 * so that freed memory does not retain sensitive data.
 */
export function memzeroCipher(sodium: Sodium, cipher: Cipher) {
  if (cipher.algorithm === 'box') {
    sodium.memzero(cipher.privateKey)
    return
  }
  if (cipher.algorithm === 'sealedBox') {
    sodium.memzero(cipher.privateKey)
    return
  }
  if (cipher.algorithm === 'secretBox') {
    sodium.memzero(cipher.key)
    return
  }
  throw new Error('Unsupported cipher algorithm')
}
