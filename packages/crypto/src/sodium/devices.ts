import type { SecretBoxCipher } from './ciphers'
import type { Sodium } from './sodium'

/**
 * Device labels are end-to-end encrypted with an account-level key, derived
 * from the keychainBased key.
 *
 * _Algorithm: Blake2b_
 */
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
