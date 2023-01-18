# Authentication

Authentication of a user in e2esdk is tied to their [identity](./identity.md).

Rather than sending a secret to the server (like a password) to gain access to
the service, and subsequently sending a server-generated token (opaque or JWT),
e2esdk uses public key authentication.

## Public key authentication

In a similar vein to SSH, e2esdk uses a public/private key pair to authenticate
requests made to the server.

Unlike SSH, which uses this technique to encrypt data bidirectionally (using
the server's public key to encrypt data going to the server, and the client
private key to decrypt data coming back from the server), data is sent in
clear-text in e2esdk, and only signed.

The reason we can get away with clear-text transport is that any sensitive
data is already encrypted by the client. Clear-text metadata like timestamps
and IDs are actually needed by the server to perform its functions.

The use of TLS (HTTPS) is highly recommended, but is technically not necessary
for message integrity to be ensured, thanks to mutual authentication.

## Mutual authentication

Not only does the server authenticate requests from clients, clients themselves
will also authenticate the server response.

This is setup by configuring the e2esdk client with the server public key in
an offline manner (usually passed in via code or configuration at build time).

## TOFU (Trust on first use)

How do we trust we're talking to the right server upon signup?

The server returns our signup data as part of the signup API call, we can
then verify the returned data matches and the server signature is correct.

The only thing a MitM could do is store a copy of the public identity to their
shadow server, but they won't be able to modify the response or subsequently
make any authenticated calls to the genuine server, as they do not have access
to either the client private key to forge request signatures, nor the server
private key to forge response signatures.

## Replay attacks & forgery prevention

In order to prevent signature forgery by a MitM, the following request elements
are signed:

- The HTTP method used (eg: `GET`, `POST`, `DELETE`)
- The complete server URL (eg: `https://e2esdk-api.example.com/v1/identity/alice`)
- The current timestamp, as ISO-8601
- The user ID making the request
- The client ID (UUIDv4 unique per instance of the e2esdk client)
- The contents of the body (if any)
- The public key of the recipient server

Since the signature algorithm (Ed25519) has exclusive ownership (the public key
is involved in the calculation of the signature), we don't need to specify the
sender's public key. We do however add the recipient server public key to add
a layer of authentication. This would become useful as we add server keypair
rotation in the future, to allow (or not) old public keys to be used.

Adding the current timestamp is a way to prevent replay attacks outside a grace
period. To account for client/server clock drift, the server will accept requests
signed +/- 1 minute around its current time. A more secure system could involve
an additional nonce used as a request identifier, but would require the server to
keep a stateful store of seen nonces (they could be ephemeral with a TTL of
2 minutes).

## Request headers

Authentication is stored in the following request headers:

- `x-e2esdk-user-id`
- `x-e2esdk-client-id`
- `x-e2esdk-timestamp`
- `x-e2esdk-signature`

## Server response authentication

The server will sign the following response elements:

- The request method (eg: `GET`, `POST`, `DELETE`)
- The complete request URL
- The current timestamp
- The response body
- The recipient user ID who performed the request
- The recipient client ID
- The recipient signature public key

The client can then verify the validity of the response before handling the
response data.

Response authentication is stored in the same header names as the request.

In addition, the server will always send the `x-e2esdk-server-pubkey` header
(even on errors and unauthenticated calls), containing its signature public key.

## Caveats

One major drawback of authenticating the response is that it makes caching
impossible.

While it would be possible to cache within the clock drift grace period, where
an older timestamp would be allowed, because clock drift cannot reliably be
predicted, such a cache would lead to flaky results.
