import { ready, sodium } from '../sodium/sodium'
import {
  base64UrlDecode,
  base64UrlEncode,
  boolToBytes,
  bytesToBool,
  ieee754BytesToNumber,
  numberToIEEE754Bytes,
  _xor,
} from './codec'

beforeAll(() => ready)

describe('codec', () => {
  test.each(Array.from({ length: 32 }, (_, i) => i))(
    'base64url (buffer size %d)',
    bufferSize => {
      const buffer = sodium.randombytes_buf(bufferSize)
      // Ensure we have the special two chars
      buffer[0] = 0xff
      buffer[2] = 0xfe
      const b64Sodium = sodium.to_base64(buffer)
      expect(base64UrlDecode(base64UrlEncode(buffer))).toEqual(buffer)
      expect(base64UrlEncode(base64UrlDecode(b64Sodium))).toEqual(b64Sodium)
      expect(base64UrlEncode(buffer)).toEqual(sodium.to_base64(buffer))
      expect(base64UrlDecode(b64Sodium)).toEqual(sodium.from_base64(b64Sodium))
    }
  )

  test('base64UrlDecode supports padded and unpadded inputs', () => {
    expect(base64UrlDecode('Kg==')).toEqual(new Uint8Array([42]))
    expect(base64UrlDecode('Kg')).toEqual(new Uint8Array([42]))
    expect(base64UrlDecode('Kg')).toEqual(new Uint8Array([42]))
    expect(base64UrlDecode('Af8')).toEqual(new Uint8Array([1, 255]))
    expect(base64UrlDecode('Af8=')).toEqual(new Uint8Array([1, 255]))
  })

  test('base64UrlDecode throws on invalid inputs', () => {
    expect(() => base64UrlDecode('Kg=')).toThrow()
    expect(() => base64UrlDecode('@&==')).toThrow()
  })

  test('base64UrlDecode supports +/ base64 dictionary', () => {
    const expected = new Uint8Array([0xff, 0x2a, 0xfe, 0xed])
    expect(base64UrlDecode('_yr-7Q')).toEqual(expected)
    expect(base64UrlDecode('/yr+7Q')).toEqual(expected)
    // Mixed dictionaries
    expect(base64UrlDecode('_yr+7Q')).toEqual(expected)
    expect(base64UrlDecode('/yr-7Q')).toEqual(expected)
    // With padding
    expect(base64UrlDecode('_yr-7Q==')).toEqual(expected)
    expect(base64UrlDecode('/yr+7Q==')).toEqual(expected)
    expect(base64UrlDecode('_yr+7Q==')).toEqual(expected)
    expect(base64UrlDecode('/yr-7Q==')).toEqual(expected)
  })

  test('base64UrlEncode', () => {
    expect(base64UrlEncode(new Uint8Array([42]))).toEqual('Kg')
    expect(base64UrlEncode(new Uint8Array([1, 255]))).toEqual('Af8')
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

  test('xor', () => {
    expect(_xor(Buffer.from([0x00]))).toBe(false)
    expect(_xor(Buffer.from([0x01]))).toBe(true)
    expect(_xor(Buffer.from([0x03]))).toBe(false)
    expect(_xor(Buffer.from([0x01, 0x01]))).toBe(false)
    expect(_xor(Buffer.from([0x01, 0x03]))).toBe(true)
  })

  test('bool <-> bytes', () => {
    for (let i = 0; i < 10000; ++i) {
      const expected = Math.random() > 0.5
      const received = bytesToBool(boolToBytes(expected))
      expect(received).toEqual(expected)
    }
  })
})
