import { signHash, verifySignedHash } from './signHash'
import type { Sodium } from './sodium'

export type PublicKeyAuthArgs = {
  timestamp: string
  method: string
  url: string
  body?: string
  userId?: string
  serverPublicKey: string | Uint8Array
  clientPublicKey?: string | Uint8Array
}

export function sign(
  sodium: Sodium,
  privateKey: Uint8Array,
  args: PublicKeyAuthArgs
) {
  return sodium.to_base64(
    signHash(sodium, privateKey, ...getSignatureElements(sodium, args))
  )
}

export function verify(
  sodium: Sodium,
  publicKey: Uint8Array,
  signature: string,
  args: PublicKeyAuthArgs
) {
  return verifySignedHash(
    sodium,
    publicKey,
    sodium.from_base64(signature),
    ...getSignatureElements(sodium, args)
  )
}

// --

function getSignatureElements(
  sodium: Sodium,
  {
    timestamp,
    method,
    url,
    body,
    userId,
    serverPublicKey,
    clientPublicKey,
  }: PublicKeyAuthArgs
) {
  return [
    sodium.from_string(timestamp),
    sodium.from_string(method),
    sodium.from_string(url),
    body ? sodium.from_string(body) : null,
    userId ? sodium.from_string(userId) : null,
    typeof serverPublicKey === 'string'
      ? sodium.from_base64(serverPublicKey)
      : serverPublicKey,
    typeof clientPublicKey === 'string'
      ? sodium.from_base64(clientPublicKey)
      : clientPublicKey,
  ].filter(Boolean) as Uint8Array[]
}
