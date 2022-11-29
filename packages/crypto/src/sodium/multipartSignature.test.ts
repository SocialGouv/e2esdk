import { concat } from '../shared/utils'
import {
  multipartSignature,
  verifyMultipartSignature,
} from './multipartSignature'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('multipartSignature', () => {
  test('known vectors', async () => {
    // const privateKey = sodium.from_hex(
    //   '3f1fcdac356ae7924e1358d1efc244155a1756e1434df06094c1d868357575ae1f5c53ba82fffdd4191803f484fe685a2c4652e150696fc8fda7d05fcc8a1e15'
    // )
    const publicKey = sodium.from_hex(
      '1f5c53ba82fffdd4191803f484fe685a2c4652e150696fc8fda7d05fcc8a1e15'
    )
    const a = sodium.from_hex('d1cd26bb39450181')
    const b = sodium.from_hex('80cc62c261b30c32')
    const c = sodium.from_hex('bfe93254c419de3c')
    const signature = sodium.from_hex(
      '601a4c9face0e4c8d9176a2b41fab25bca2479fc8d893dbe6d41e39b83155b47149d287a9979addcbd9f657edf7cf3f2caba68329da6bdf2838d3ac02462640a'
    )
    const verified = verifyMultipartSignature(
      sodium,
      publicKey,
      signature,
      a,
      b,
      c
    )
    expect(verified).toBe(true)
  })

  describe.each([
    {
      label: 8,
      getBlockLength: () => 8,
    },
    {
      label: 47,
      getBlockLength: () => 47,
    },
    {
      label: 'random size (8-64)',
      getBlockLength: () => Math.round(8 + 56 * Math.random()),
    },
  ])('blocks of $label bytes', ({ getBlockLength }) => {
    test('matching', async () => {
      const alice = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, alice.privateKey, a, b, c)
      const verified = verifyMultipartSignature(
        sodium,
        alice.publicKey,
        signature,
        a,
        b,
        c
      )
      expect(verified).toBe(true)
    })

    test('mismatching public key', async () => {
      const alice = sodium.crypto_sign_keypair()
      const eve = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, alice.privateKey, a, b, c)
      const verified = verifyMultipartSignature(
        sodium,
        eve.publicKey,
        signature,
        a,
        b,
        c
      )
      expect(verified).toBe(false)
    })

    test('mismatching private key', async () => {
      const alice = sodium.crypto_sign_keypair()
      const eve = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, eve.privateKey, a, b, c)
      const verified = verifyMultipartSignature(
        sodium,
        alice.publicKey,
        signature,
        a,
        b,
        c
      )
      expect(verified).toBe(false)
    })

    test('mismatching signature', async () => {
      const alice = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, alice.privateKey, a, b, c)
      signature.sort()
      const verified = verifyMultipartSignature(
        sodium,
        alice.publicKey,
        signature,
        a,
        b,
        c
      )
      expect(verified).toBe(false)
    })

    test('tampering with data', async () => {
      const alice = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, alice.privateKey, a, b, c)
      const verified = verifyMultipartSignature(
        sodium,
        alice.publicKey,
        signature,
        // Reordered data
        c,
        a,
        b
      )
      expect(verified).toBe(false)
    })

    test('resistance to canonicalisation attacks', async () => {
      const alice = sodium.crypto_sign_keypair()
      const a = sodium.randombytes_buf(getBlockLength())
      const b = sodium.randombytes_buf(getBlockLength())
      const c = sodium.randombytes_buf(getBlockLength())
      const signature = multipartSignature(sodium, alice.privateKey, a, b, c)
      // Canonicalisation attack:
      // legit    [aaaaaa][bbbbbb][cccccc]
      // tampered [aaaaa][abbbbbbc][ccccc]
      const a_ = new Uint8Array(a.slice(0, a.byteLength - 1))
      const b_ = new Uint8Array([a[a.byteLength - 1]!, ...b.slice(), c[0]])
      const c_ = new Uint8Array(c.slice(1))
      expect(concat(a, b, c)).toEqual(concat(a_, b_, c_))
      const verified = verifyMultipartSignature(
        sodium,
        alice.publicKey,
        signature,
        a_,
        b_,
        c_
      )
      expect(verified).toBe(false)
    })
  })
})
