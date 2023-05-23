import { SecretBoxCipher } from './ciphers'
import { Sodium } from './sodium'

/**
 * Derive the OPAQUE export key into a symmetric encryption cipher
 *
 * An OPAQUE key agreement is performed when signing up and logging into e2esdk,
 * which generates an export key on the client only. This export key is used
 * to wrap the mainKey associated with the user identity.
 *
 * Each device enrolled by the user brings its own export key, and therefore
 * a copy of the wrapped main key exists per-device, allowing revoking devices
 * easily, as well as rotating device credentials with minimal server updates.
 *
 * @param exportKey The OPAQUE client export key obtained after
 *   completing a registration or login flow
 * @returns a symmetric Cipher to encrypt/decrypt the mainKey for this device.
 */
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
