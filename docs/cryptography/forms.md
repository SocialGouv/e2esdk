# Form data encryption

To ingest encrypted data from outside (public) sources, like forms being
submitted by outsiders (people without a cryptographic Identity on the platform),
we use the following protocol.

## Public key cryptography

Algorithm: Sodium sealed box _(X25519-XSalsa20-Poly1305)_

A form is cryptographically represented by an encryption key pair.

The public key is distributed with the interface to encrypt submitted form data.

The private key is kept by the recipients of the form responses in e2esdk, and
is used for decryption.

## Secret key cryptography

To allow edition of submitted data at a later time by the sender, we need to
use secret key cryptography.

Each field in the data to encrypt will use a secret key, derived somehow
from a secret, which is encrypted (sealed) with the form public key and sent along
with the encrypted form data.

On the receiving side, recipients can:

1. Unseal the secret
2. Derive the secret key for each field to decrypt
3. Decrypt that field

We'll see later how those secret keys are derived, but first we need to look
into how we authenticate submissions.

## Authentication

Since we want to allow editions, we need a way to identify a sender to allow
them to edit their own submissions, but not others' (though the key derivation
mechanism makes it impossible for a sender to decrypt other's submissions, they
could entirely overwrite existing submissions if no authentication was in place).

Identity for senders is represented by a signature key pair _(Ed25519)_, derived
from a main secret. That secret is persisted in local storage to allow resuming
edition at a later time.

Along with the encrypted fields and the sealed secret, the sender calculates
and sends a signature for their submission, and the associated public key.
This will allow the server and the recipients to verify the integrity of the
data, and authenticate the sender.

## Key derivation

From a main secret key (32 random bytes):

1. Generate an intermediary 32 bytes key, corresponding to the BLAKE2b
   hash of the form public key, keyed by the main secret.

2. Derive a 32 bytes seed for the signature key pair,
   using KDF parameters:

   - key index: 0
   - context: `'formidkp'`

3. Derive the key derivation secret, using KDF parameters:

   - key index: 0
   - context: `'formkdfs'`

4. Derive the signature key pair from the seed computed at step 2

This construction ensures:

- That the main secret key is never used directly afterwards
- That keys are derived from a secret that is dissociated from the signature
- That an identity is tied to a form's public key, allowing the same
  person to answer multiple forms independently. If this is undesirable,
  another (cleartext) method of identification of senders is to be used.

### Field encryption key derivation

For each field to encrypt, a secret key is derived from the
key derivation secret using the following KDF parameters:

- key index: random unsigned integer of 31 bits (0 to 0x7fffffff)
- context: the first 8 characters of the base64url representation of the
  form public key

> **Note**
> While Sodium was designed to allow 64 bits worths of key indices,
> bitwise maths in JavaScript works on signed 32 bits integers,
> so we constrain the subkey space to 31 bits to keep things unsigned.
> [Read more](https://github.com/jedisct1/libsodium.js/issues/135).

The context can trivially be computed on the sender and receiver side,
but the key index has to be transmitted along with the ciphertext,
to allow derivation of the correct decryption key on the receiver side.

The key index is hex-encoded into an 8 character string, and prepended
to the ciphertext with a colon separation:

```
01234567:v1.secretBox.txt.{nonce}.{ciphertext}
```

## Signature

todo: Add signature documentation
