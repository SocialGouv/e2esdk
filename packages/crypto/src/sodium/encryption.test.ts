import {
  boxCiphertextV1Schema,
  sealedBoxCiphertextV1Schema,
  secretBoxCiphertextV1Schema,
} from '@socialgouv/e2esdk-api'
import { concat } from '../shared/utils'
import { generateSealedBoxCipher } from './ciphers'
import { _generateBoxCipher, _generateSecretBoxCipher } from './ciphers.test'
import { decrypt, encodedCiphertextFormatV1, encrypt } from './encryption'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

const BUFFER_SIZES = [0, 32, 128, 1234, 1 << 16]

const STRING_INPUTS = Object.entries({
  'empty string': '',
  emoji: '😀',
  'hello world': 'Hello, world!',
  poem: `
    A Elbereth Gilthoniel
    silivren penna míriel
    o menel aglar elenath!
    Na-chaered palan-díriel
    o galadhremmin ennorath,
    Fanuilos, le linnathon
    nef aear, sí nef aearon!
  `,
})

const NUMBER_INPUTS = [
  0,
  1,
  1234567890,
  1 << 24,
  (1 << 32) - 1,
  -1 << 22,
  Math.PI,
  Math.sqrt(2),
  0.1 + 0.2,
]

describe('encryption', () => {
  describe('box', () => {
    describe.each(BUFFER_SIZES)('buffer input (size %d)', cleartextLength => {
      test('-> buffer', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const cipher = _generateBoxCipher(sodium)
        const ciphertext = encrypt(sodium, input, cipher, null, 'uint8array')
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.byteLength).toEqual(
          sodium.crypto_box_NONCEBYTES +
            cleartextLength +
            sodium.crypto_box_MACBYTES
        )
      })

      test('-> encodedCiphertextFormatV1', async () => {
        const input = sodium.randombytes_buf(32)
        const cipher = _generateBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(boxCiphertextV1Schema('bin').parse(ciphertext)).toEqual(
          ciphertext
        )
      })

      test('output format equivalence', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
        const cipher = _generateBoxCipher(sodium, nonce)
        const buffer = encrypt(sodium, input, cipher, null, 'uint8array')
        const v1 = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )

        expect(
          concat(
            sodium.from_base64(v1.split('.')[3]),
            sodium.from_base64(v1.split('.')[4])
          )
        ).toEqual(buffer)
      })
    })

    describe.each(STRING_INPUTS)('string input (%s)', (_, input) => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = _generateBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(boxCiphertextV1Schema('txt').parse(ciphertext)).toEqual(
          ciphertext
        )
      })
    })

    describe.each(NUMBER_INPUTS)('number input (%d)', input => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = _generateBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(boxCiphertextV1Schema('num').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(76)
      })
    })

    describe.each([true, false])('boolean input (%s)', input => {
      test('boolean -> encodedCiphertextFormatV1', async () => {
        const cipher = _generateBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(boxCiphertextV1Schema('bool').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(109)
      })
    })
  })

  // ---------------------------------------------------------------------------

  describe('secretBox', () => {
    describe.each(BUFFER_SIZES)('buffer input (size %d)', cleartextLength => {
      test('-> buffer', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const cipher = _generateSecretBoxCipher(sodium)
        const ciphertext = encrypt(sodium, input, cipher, null, 'uint8array')
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.byteLength).toEqual(
          sodium.crypto_secretbox_NONCEBYTES +
            cleartextLength +
            sodium.crypto_secretbox_MACBYTES
        )
      })

      test('-> encodedCiphertextFormatV1', async () => {
        const input = sodium.randombytes_buf(32)
        const cipher = _generateSecretBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.slice(0, 17)).toBe('v1.secretBox.bin.')
        expect(secretBoxCiphertextV1Schema('bin').parse(ciphertext)).toEqual(
          ciphertext
        )
      })

      test('output format equivalence', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
        const cipher = _generateSecretBoxCipher(sodium, nonce)
        const buffer = encrypt(sodium, input, cipher, null, 'uint8array')
        const v1 = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        expect(
          concat(
            sodium.from_base64(v1.split('.')[3]),
            sodium.from_base64(v1.split('.')[4])
          )
        ).toEqual(buffer)
      })
    })

    describe.each(STRING_INPUTS)('string input (%s)', (_, input) => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = _generateSecretBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.slice(0, 17)).toBe('v1.secretBox.txt.')
        expect(secretBoxCiphertextV1Schema('txt').parse(ciphertext)).toEqual(
          ciphertext
        )
      })
    })

    describe.each(NUMBER_INPUTS)('number input (%f)', input => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = _generateSecretBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.slice(0, 17)).toBe('v1.secretBox.num.')
        expect(secretBoxCiphertextV1Schema('num').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(82)
      })
    })

    describe.each([true, false])('boolean input (%s)', input => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = _generateSecretBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.slice(0, 18)).toBe('v1.secretBox.bool.')
        expect(secretBoxCiphertextV1Schema('bool').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(115)
      })
    })
  })

  // ---------------------------------------------------------------------------

  describe('sealedBox', () => {
    describe.each(BUFFER_SIZES)('buffer input (size %d)', cleartextLength => {
      test('-> buffer', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const cipher = generateSealedBoxCipher(sodium)
        const ciphertext = encrypt(sodium, input, cipher, null, 'uint8array')
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(ciphertext.byteLength).toEqual(
          sodium.crypto_box_SEALBYTES + cleartextLength
        )
      })

      test('-> encodedCiphertextFormatV1', async () => {
        const input = sodium.randombytes_buf(cleartextLength)
        const cipher = generateSealedBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(sealedBoxCiphertextV1Schema('bin').parse(ciphertext)).toEqual(
          ciphertext
        )
      })
    })

    describe.each(STRING_INPUTS)('string input (%s)', (_, input) => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = generateSealedBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(sealedBoxCiphertextV1Schema('txt').parse(ciphertext)).toEqual(
          ciphertext
        )
      })
    })

    describe.each(NUMBER_INPUTS)('number input (%f)', input => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = generateSealedBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(sealedBoxCiphertextV1Schema('num').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(92)
      })
    })

    describe.each([true, false])('boolean input (%s)', input => {
      test('-> encodedCiphertextFormatV1', async () => {
        const cipher = generateSealedBoxCipher(sodium)
        const ciphertext = encrypt(
          sodium,
          input,
          cipher,
          null,
          encodedCiphertextFormatV1
        )
        const cleartext = decrypt(sodium, ciphertext, cipher)
        expect(cleartext).toEqual(input)
        expect(sealedBoxCiphertextV1Schema('bool').parse(ciphertext)).toEqual(
          ciphertext
        )
        expect(ciphertext.length).toEqual(125)
      })
    })
  })
})
