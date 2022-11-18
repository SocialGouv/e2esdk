import { ready, sodium } from '../sodium/sodium'
import { base64UrlDecode, base64UrlEncode } from './codec'

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
})
