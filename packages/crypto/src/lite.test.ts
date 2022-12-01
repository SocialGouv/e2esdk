import { deriveKey, _seal } from './lite'
import { generateSealedBoxCipher } from './sodium/ciphers'
import { decrypt } from './sodium/encryption'
import { ready, sodium } from './sodium/sodium'

beforeAll(() => ready)

describe('lite', () => {
  test('lite sealed boxes are compatible with libsodium', () => {
    const input = sodium.randombytes_buf(32)
    const cipher = generateSealedBoxCipher(sodium)
    const ciphertext = _seal(input, cipher.publicKey)
    const cleartext = decrypt(sodium, ciphertext, cipher)
    expect(cleartext).toEqual(input)
  })

  test.each([
    { length: 16, context: 'abcdefgh', index: 0 },
    { length: 32, context: 'abcdefgh', index: 0 },
    { length: 64, context: 'abcdefgh', index: 0 },
    { length: 16, context: 'abcdefgh', index: 1 },
    { length: 32, context: 'abcdefgh', index: 1 },
    { length: 64, context: 'abcdefgh', index: 1 },
    { length: 16, context: 'abcdefgh', index: 1 << 16 },
    { length: 32, context: 'abcdefgh', index: 1 << 16 },
    { length: 64, context: 'abcdefgh', index: 1 << 16 },
    { length: 16, context: 'abcdefgh', index: 0x7fffff },
    { length: 32, context: 'abcdefgh', index: 0x7fffff },
    { length: 64, context: 'abcdefgh', index: 0x7fffff },
    { length: 32, context: 'ijklmnop', index: 0 },
    { length: 32, context: 'qrstuvwx', index: 0 },
  ])(
    `key derivation is compatible with libsodium ($length $context $index)`,
    ({ length, index, context }) => {
      const mainKey = sodium.crypto_kdf_keygen()
      const kds = sodium.crypto_kdf_derive_from_key(
        length,
        index,
        context,
        mainKey
      )
      const kdl = deriveKey(length, index, context, mainKey)
      expect(kdl).toEqual(kds)
    }
  )
})
