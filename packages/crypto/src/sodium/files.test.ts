import { Blob } from 'node:buffer'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generateSecretBoxCipher } from './ciphers'
import { decryptFile, encryptFile } from './files'
import { ready, sodium } from './sodium'

const __filename = fileURLToPath(import.meta.url)

beforeAll(() => ready)

describe('crypto/files', () => {
  test('encrypt / decrypt your own source code', async () => {
    const fileContent = new Uint8Array(await fs.readFile(__filename))
    const blob: any = new Blob([fileContent])
    const cipher = generateSecretBoxCipher(sodium)
    const ciphertext = await encryptFile(sodium, blob, cipher)
    const cleartext = decryptFile(sodium, ciphertext, cipher)
    expect(ciphertext[0]).toEqual(12) // 4096 byte chunk by default
    expect(cleartext).toEqual(fileContent)
  })
})
