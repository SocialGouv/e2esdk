import { signHash, verifySignedHash } from './signHash'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('signHash', () => {
  test('known vectors', async () => {
    // Private key:
    // 3f1fcdac356ae7924e1358d1efc244155a1756e1434df06094c1d868357575ae1f5c53ba82fffdd4191803f484fe685a2c4652e150696fc8fda7d05fcc8a1e15
    const publicKey = sodium.from_hex(
      '1f5c53ba82fffdd4191803f484fe685a2c4652e150696fc8fda7d05fcc8a1e15'
    )
    const a = sodium.from_hex('d1cd26bb39450181')
    const b = sodium.from_hex('80cc62c261b30c32')
    const c = sodium.from_hex('bfe93254c419de3c')
    const signature = sodium.from_hex(
      '5951e14531b3cd88a3705a7c1ec579a32cf2af323aca5fe802ad334b3a0b6000ecd1e42ebed8cfb8e329c800008c4bce20a60a97e7ea1a8a6a7695a12e6e6403'
    )
    const verified = verifySignedHash(sodium, publicKey, signature, a, b, c)
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
      const signature = signHash(sodium, alice.privateKey, a, b, c)
      const verified = verifySignedHash(
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
      const signature = signHash(sodium, alice.privateKey, a, b, c)
      const verified = verifySignedHash(
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
      const signature = signHash(sodium, eve.privateKey, a, b, c)
      const verified = verifySignedHash(
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
      const signature = signHash(sodium, alice.privateKey, a, b, c)
      signature.sort()
      const verified = verifySignedHash(
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
      const signature = signHash(sodium, alice.privateKey, a, b, c)
      const verified = verifySignedHash(
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
  })
})
