import type { SecretBoxCipher } from './ciphers'
import type { Sodium } from './sodium'

export function getDeviceLabelCipher(
  sodium: Sodium,
  userId: string,
  keychainBaseKey: Uint8Array
): SecretBoxCipher {
  return {
    algorithm: 'secretBox',
    key: sodium.crypto_generichash(
      sodium.crypto_secretbox_KEYBYTES,
      keychainBaseKey,
      'e2esdk-device-label-key:' + userId
    ),
  }
}
