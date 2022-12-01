# Signatures

## Algorithm

Ed25519ph (using the default SHA-512 pre-hash) for multi-part signatures.

## Manifest

To prevent against canonicalisation attacks, multi-part elements to be signed
are prepended with a manifest before being concatenated and SHA-512'd by Ed25519ph.

This manifest contains the concatenation of:

- The number of elements to sign, as a single byte
  (so only up to 255 elements can be signed at a time)
- For each element to sign, the byte length of the element as a little-endian unsigned int (32 bits / 4 bytes)

Example, the manifest of three elements of respective byte sizes 32, 1024 and 1234567890 has a binary representation of:

```
--- Number of elements
00 [0x03]
--- First element size (LSB first)
01 [0x20]
02 [0x00]
03 [0x00]
04 [0x00]
--- Second element size
05 [0x00]
06 [0x00]
07 [0x04]
08 [0x00]
--- Third element size
09 [0xd2]
0a [0x02]
0b [0x96]
0c [0x49]
```
