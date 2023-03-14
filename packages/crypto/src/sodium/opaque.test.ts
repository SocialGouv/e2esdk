import { getOpaqueExportCipher } from './opaque'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('OPAQUE', () => {
  test('export cipher non-regression', () => {
    const exportKey = new Uint8Array(Buffer.alloc(64, 0x00))
    const cipher = getOpaqueExportCipher(sodium, exportKey)
    expect(Buffer.from(cipher.key).toString('hex')).toEqual(
      'ca86161c8d06a08f3fa41e811d7e16d62d7dabce102540816ef47e93eb2e97ae'
    )
  })
})
