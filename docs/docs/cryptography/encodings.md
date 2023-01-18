# Encodings

## Binary data

Binary data is represented using base64url encoding, without padding.

In some rare cases where base64's malleability is undesirable, hexadecimal
encoding is used instead.

It is the case for serialising Cipher objects, to prevent base64 malleability
from yielding two different fingerprints for the same underlying Cipher.

## Ciphertext v1

All ciphertext in version 1 is serialised and canonicalised under a
string representation that also carries:

- The algorithm being used
- The payload type (for post-decryption hydration back into a JS primitive)

### Box

```
v1.box.{payloadType}.{base64url(nonce)}.{base64url(ciphertext)}
```

### Secret box

```
v1.secretBox.{payloadType}.{base64url(nonce)}.{base64url(ciphertext)}
```

### Sealed box

_Note that there is no nonce for sealed boxes_

```
v1.sealedBox.{payloadType}.{base64url(ciphertext)}
```

## Fingerprints

Algorithm: BLAKE2b, default params, no key, 32 byte output base64url encoded.
