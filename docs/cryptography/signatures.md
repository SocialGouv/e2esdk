# Signatures

## Algorithm

Ed25519ph (using the default SHA-512 pre-hash) for multi-part signatures.

## Manifest

To prevent against canonicalisation attacks, multi-part elements to be signed
are prepended with a manifest before being concatenated and SHA-512'd by Ed25519ph.

This manifest contains the concatenation of:

- The number of elements to sign, as a little-endian unsigned int (32 bits / 4 bytes)
- For each element to sign, the byte length of the element as a little-endian unsigned int (32 bits / 4 bytes)

Example, the manifest of three elements of respective byte sizes 32, 1024 and 1234567890 has a binary representation of:

```
--- Number of elements
00 [0x03]
01 [0x00]
02 [0x00]
03 [0x00]
--- First element size (LSB first)
04 [0x20]
05 [0x00]
06 [0x00]
07 [0x00]
--- Second element size
08 [0x00]
09 [0x00]
0a [0x04]
0b [0x00]
--- Third element size
0c [0xd2]
0d [0x02]
0e [0x96]
0f [0x49]
```
