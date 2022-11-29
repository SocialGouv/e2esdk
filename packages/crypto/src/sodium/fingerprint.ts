import type { Sodium } from './sodium'

export function fingerprint(sodium: Sodium, input: string | Uint8Array) {
  return sodium.crypto_generichash(32, input, null, 'base64')
}
