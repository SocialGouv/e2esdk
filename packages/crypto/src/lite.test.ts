import { _seal } from './lite'
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
})
