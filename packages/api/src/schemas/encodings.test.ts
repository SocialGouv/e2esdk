import crypto from 'node:crypto'
import { base64Bytes } from './encodings'

describe('encodings', () => {
  test.each(
    Array.from({ length: 32 }, (_, i) => i + 12).map(bytes => ({
      bytes,
      str: crypto.randomBytes(bytes).toString('base64url'),
    }))
  )('base64Bytes($bytes)', ({ bytes, str }) => {
    expect(base64Bytes(bytes).parse(str)).toEqual(str)
  })
})
