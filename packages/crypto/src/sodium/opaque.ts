import { SecretBoxCipher } from './ciphers'
import { Sodium } from './sodium'

export function getOpaqueExportCipher(
  sodium: Sodium,
  exportKey: Uint8Array
): SecretBoxCipher {
  if (exportKey.byteLength !== 64) {
    throw new RangeError('Invalid OPAQUE export key length')
  }
  return {
    algorithm: 'secretBox',
    key: sodium.crypto_generichash(
      sodium.crypto_secretbox_KEYBYTES,
      exportKey,
      'e2esdk-opaque-export-key'
    ),
  }
}
