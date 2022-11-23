import crypto from 'node:crypto'
import { generateManifest } from './manifest'

describe('crypto/manifest', () => {
  test('empty manifest (no input data)', () => {
    const received = generateManifest([])
    const expected = new Uint8Array([0])
    expect(received).toEqual(expected)
  })
  test('one item', () => {
    const received = generateManifest([new Uint8Array([1, 2, 3, 4])])
    const expected = new Uint8Array([1, 4, 0, 0, 0])
    expect(received).toEqual(expected)
  })
  test('multiple items of various lengths', () => {
    const received = generateManifest([
      new Uint8Array(crypto.randomBytes(4)),
      new Uint8Array(crypto.randomBytes(32)),
      new Uint8Array(crypto.randomBytes(1024)),
    ])
    // prettier-ignore
    const expected = new Uint8Array([
      3, // number of elements
      4, 0, 0, 0, // first element
      32, 0, 0, 0, // second
      0, 4, 0, 0 // third
    ])
    expect(received).toEqual(expected)
  })
})
