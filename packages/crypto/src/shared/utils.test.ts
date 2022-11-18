import { ready, sodium } from '../sodium/sodium'
import { base64UrlEncode } from './codec'
import {
  checkEncryptionPublicKey,
  checkSignaturePublicKey,
  concat,
  ieee754BytesToNumber,
  numberToIEEE754Bytes,
  randomPad,
  split,
} from './utils'

beforeAll(() => ready)

describe('utils', () => {
  test('concat', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([5, 6, 7, 8])
    const c = new Uint8Array([9, 10])
    const cat = concat(a, b, c)
    expect(cat).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  })

  test('split', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const [a, b] = split(input, 4)
    expect(a).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(b).toEqual(new Uint8Array([5, 6, 7, 8]))
  })

  test('checkSignaturePublicKey', async () => {
    const alice = sodium.crypto_sign_keypair()
    const eve = sodium.crypto_sign_keypair()
    expect(
      checkSignaturePublicKey(sodium, alice.publicKey, alice.privateKey)
    ).toBe(true)
    expect(
      checkSignaturePublicKey(sodium, eve.publicKey, alice.privateKey)
    ).toBe(false)
  })

  test('checkEncryptionPublicKey', async () => {
    const alice = sodium.crypto_box_keypair()
    const eve = sodium.crypto_box_keypair()
    expect(
      checkEncryptionPublicKey(sodium, alice.publicKey, alice.privateKey)
    ).toBe(true)
    expect(
      checkEncryptionPublicKey(sodium, eve.publicKey, alice.privateKey)
    ).toBe(false)
  })

  describe('randomPad', () => {
    test('input shorted than outputLength returns unpadded', () => {
      const expected = 'Hello, world!'
      const received = randomPad(expected, 5)
      expect(received).toEqual(expected)
    })
    test('input of length outputLength returns unpadded', () => {
      const expected = 'Hello, world!'
      const received = randomPad(expected, expected.length)
      expect(received).toEqual(expected)
    })
    test('1 character of padding', () => {
      const expected = 'Hello, world!'
      const received = randomPad(expected, expected.length + 1)
      expect(received.length).toEqual(expected.length + 1)
      expect(received).toMatch(/^ Hello, world!$|^Hello, world! $/)
    })
    test.each(Array.from({ length: 10 }, (_, x) => 3 * x + 5))(
      '%d character of padding',
      padLength => {
        const expected = 'Hello, world!'
        const received = randomPad(expected, expected.length + padLength)
        expect(received.length).toEqual(expected.length + padLength)
        expect(received).toMatch(/^ *Hello, world! *$/)
        const padLeft = received.length - received.trimStart().length
        const padRight = received.length - received.trimEnd().length
        expect(padLeft + padRight).toEqual(padLength)
      }
    )
  })

  describe('number <-> IEEE754 bytes', () => {
    test('NaN', () => {
      expect(base64UrlEncode(numberToIEEE754Bytes(NaN))).toEqual('AAAAAAAA-H8')
      expect(ieee754BytesToNumber(numberToIEEE754Bytes(NaN))).toBeNaN()
    })
    test('Denormal', () => {
      expect(ieee754BytesToNumber(numberToIEEE754Bytes(0.1 + 0.2))).toEqual(
        0.30000000000000004
      )
    })
    test('Large numbers', () => {
      expect(ieee754BytesToNumber(numberToIEEE754Bytes(1234567890))).toEqual(
        1234567890
      )
    })
  })
})
