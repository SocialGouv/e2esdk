import {
  deriveClientIdentity,
  generateMainKey,
  verifyClientIdentity,
} from './identity'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

type ClientIdentity = ReturnType<typeof deriveClientIdentity>

function serializeIdentity(identity: ClientIdentity) {
  return {
    userId: identity.userId,
    sharingPublicKey: sodium.to_base64(identity.sharing.publicKey),
    signaturePublicKey: sodium.to_base64(identity.signature.publicKey),
    proof: identity.proof,
  }
}

function expectTampering(identity: ClientIdentity) {
  return expect(verifyClientIdentity(sodium, serializeIdentity(identity))).toBe(
    false
  )
}

describe('identity', () => {
  test('main key length should be 32 bytes', () => {
    const mainKey = generateMainKey(sodium)
    expect(mainKey.byteLength).toEqual(32)
  })
  test('deriveClientIdentity is deterministic', () => {
    const userId = 'foo'
    const mainKey = generateMainKey(sodium)
    const i1 = deriveClientIdentity(sodium, userId, mainKey)
    const i2 = deriveClientIdentity(sodium, userId, mainKey)
    expect(i1).toEqual(i2)
  })
  test('derivation involves the user ID', () => {
    const mainKey = generateMainKey(sodium)
    const i1 = deriveClientIdentity(sodium, 'foo', mainKey)
    const i2 = deriveClientIdentity(sodium, 'bar', mainKey)
    expect(i1.proof).not.toEqual(i2.proof)
    expect(i1.personalKey).not.toEqual(i2.personalKey)
    expect(i1.sharing.publicKey).not.toEqual(i2.sharing.publicKey)
    expect(i1.sharing.privateKey).not.toEqual(i2.sharing.privateKey)
    expect(i1.signature.publicKey).not.toEqual(i2.signature.publicKey)
    expect(i1.signature.privateKey).not.toEqual(i2.signature.privateKey)
  })

  test('userId can be any length', () => {
    const mainKey = generateMainKey(sodium)
    expect(() => deriveClientIdentity(sodium, '', mainKey)).not.toThrow()
    expect(() =>
      deriveClientIdentity(
        sodium,
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur ornare vel justo sed rhoncus. Nulla tempus congue volutpat. Nullam faucibus elit in odio bibendum aliquet. In vitae sodales nisl. Integer eget feugiat lectus. Pellentesque iaculis eros est. Donec est lorem, laoreet ut erat non, fringilla ullamcorper velit. Nam tincidunt, orci vitae condimentum malesuada, felis velit laoreet libero, nec egestas odio est non mi. Ut in risus odio. Phasellus ut purus dapibus, fermentum magna in, feugiat neque. Ut eu dolor eget sapien congue cursus.',
        mainKey
      )
    ).not.toThrow()
  })

  test('proof invalidation', () => {
    const mainKey = generateMainKey(sodium)
    const tampered = deriveClientIdentity(sodium, 'foo', mainKey)
    // 1. Tamper with the proof
    const tamperedProof = sodium.from_base64(tampered.proof)
    tamperedProof[0] ^= 0xff // Flips all bits on byte 0
    tampered.proof = sodium.to_base64(tamperedProof)
    expectTampering(tampered)
  })

  test('signature keypair invalidation', () => {
    const mainKey = generateMainKey(sodium)
    const tampered = deriveClientIdentity(sodium, 'foo', mainKey)
    tampered.signature = sodium.crypto_sign_keypair()
    expectTampering(tampered)
  })

  test('sharing keypair invalidation', () => {
    const mainKey = generateMainKey(sodium)
    const tampered = deriveClientIdentity(sodium, 'foo', mainKey)
    tampered.sharing = sodium.crypto_box_keypair()
    expectTampering(tampered)
  })

  test('userId invalidation', () => {
    const mainKey = generateMainKey(sodium)
    const tampered = deriveClientIdentity(sodium, 'foo', mainKey)
    tampered.userId = 'bar'
    expectTampering(tampered)
  })

  test('personal key is not part of the proof', () => {
    const mainKey = generateMainKey(sodium)
    const tampered = deriveClientIdentity(sodium, 'foo', mainKey)
    tampered.personalKey = sodium.crypto_secretbox_keygen()
    expect(verifyClientIdentity(sodium, serializeIdentity(tampered))).toBe(true)
  })
})
