import {
  multipartSignature,
  verifyMultipartSignature,
} from './multipartSignature'
import type { Sodium } from './sodium'

export type PublicKeyAuthArgs = {
  /**
   * ISO-8601 encoded timestamp (with UTC TZ), as obtained from
   * `new Date().toISOString()`
   */
  timestamp: string

  /**
   * HTTP method used for the API call (eg: GET, POST, PUT, DELETE)
   */
  method: string

  /**
   * Full URL of the API endpoint, including the server FQDN.
   * Example: https://e2esdk.example.com/v1/users/alice
   */
  url: string

  /**
   * Optional HTTP request body as serialised JSON
   */
  body?: string

  // Authentication context
  userId: string
  clientId: string
  deviceId: string
  sessionId: string

  // Note: Ed25519 already includes the signature public key
  // in the signature calculation (exclusive ownership),
  // so we only need to authenticate the recipient.
  // This makes signing anonymous responses pointless, which it is, really.
  recipientPublicKey: string | Uint8Array
}

/**
 * Generate a digital signature for the given authentication arguments.
 *
 * This is used to mutually authenticate HTTP API calls.
 * The client will sign the request parameters (method, URL, optional body,
 * authentication context, timestamp).
 * The server will sign the response, mirroring the request parameters where
 * relevant, but signing its response body and timestamp.
 *
 * This prevents a man-in-the-middle that would already have bypassed the TLS
 * transport layer encryption to meddle with messages without having access to
 * either the client's or the server's signature private keys.
 *
 * @returns a base64url-encoded `multipartSignature` of the input arguments.
 */
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

/**
 * Verify a digital signature for the given authentication arguments
 *
 * The e2esdk server would verify client-emitted signatures in API calls as
 * part of the authentication middleware (see plugins/auth.ts in the server package).
 *
 * The client would also verify server-signed responses after authenticated API
 * calls to detect tampering of the response.
 *
 * @returns true if the signature is verified
 */
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
    deviceId,
    sessionId,
    recipientPublicKey,
  }: PublicKeyAuthArgs
) {
  return [
    sodium.from_string(timestamp),
    sodium.from_string(method),
    sodium.from_string(url),
    body ? sodium.from_string(body) : null,
    sodium.from_string(userId),
    sodium.from_string(clientId),
    sodium.from_string(deviceId),
    sodium.from_base64(sessionId),
    typeof recipientPublicKey === 'string'
      ? sodium.from_base64(recipientPublicKey)
      : recipientPublicKey,
  ].filter(Boolean) as Uint8Array[]
}
