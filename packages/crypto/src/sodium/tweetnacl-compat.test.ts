import tweetnacl from 'tweetnacl'
import { concat } from '../shared/utils'
import { _generateBoxCipher, _generateSecretBoxCipher } from './ciphers.test'
import { encrypt } from './encryption'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('tweetnacl-compat', () => {
  test('box', () => {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
    const cipher = _generateBoxCipher(sodium, nonce)
    const input = sodium.randombytes_buf(32)
    const ciphertextSodium = encrypt(sodium, input, cipher, 'uint8array')
    const ciphertextTweetNacl = tweetnacl.box(
      input,
      nonce,
      cipher.publicKey,
      cipher.privateKey
    )
    expect(sodium.to_hex(ciphertextSodium)).toEqual(
      sodium.to_hex(concat(nonce, ciphertextTweetNacl))
    )
  })

  // Note: TweetNaCl doesn't have a built-in sealed box construct,
  // it has to be done manually.

  test('secretBox', () => {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const cipher = _generateSecretBoxCipher(sodium, nonce)
    const input = sodium.randombytes_buf(32)
    const ciphertextSodium = encrypt(sodium, input, cipher, 'uint8array')
    const ciphertextTweetNacl = tweetnacl.secretbox(input, nonce, cipher.key)
    expect(sodium.to_hex(ciphertextSodium)).toEqual(
      sodium.to_hex(concat(nonce, ciphertextTweetNacl))
    )
  })
})
