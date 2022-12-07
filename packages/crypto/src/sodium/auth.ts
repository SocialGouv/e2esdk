import {
  multipartSignature,
  verifyMultipartSignature,
} from './multipartSignature'
import type { Sodium } from './sodium'

export type PublicKeyAuthArgs = {
  timestamp: string
  method: string
  url: string
  body?: string
  userId: string
  clientId: string

  // Note: Ed25519 already includes the signature public key
  // in the signature calculation (exclusive ownership),
  // so we only need to authenticate the recipient.
  // This makes signing anonymous responses pointless, which it is, really.
  recipientPublicKey: string | Uint8Array
}

export function signAuth(
  sodium: Sodium,
  privateKey: Uint8Array,
  args: PublicKeyAuthArgs
) {
  return sodium.to_base64(
    multipartSignature(
      sodium,
      privateKey,
      ...getSignatureElements(sodium, args)
    )
  )
}

export function verifyAuth(
  sodium: Sodium,
  publicKey: Uint8Array,
  signature: string,
  args: PublicKeyAuthArgs
) {
  return verifyMultipartSignature(
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
    clientId,
    recipientPublicKey,
  }: PublicKeyAuthArgs
) {
  return [
    sodium.from_string(timestamp),
    sodium.from_string(method),
    sodium.from_string(url),
    body ? sodium.from_string(body) : null,
    userId ? sodium.from_string(userId) : null,
    sodium.from_string(clientId),
    typeof recipientPublicKey === 'string'
      ? sodium.from_base64(recipientPublicKey)
      : recipientPublicKey,
  ].filter(Boolean) as Uint8Array[]
}
