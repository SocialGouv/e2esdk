import { numberToUint32LE } from '../shared/codec'

/**
 * A manifest is a buffer containing the number of elements passed,
 * and their lengths.
 *
 * This is used to prevent canonicalisation attacks when an untrusted
 * list of elements is fed to a hash function.
 * https://soatok.blog/2021/07/30/canonicalization-attacks-against-macs-and-signatures/
 *
 * ### Encoding
 *
 * The first four bytes is the number of elements (little-endian 32 bit unsigned).
 *
 * Each subsequent block of 4 bytes is the little-endian 32 bit unsigned
 * representation of the length of the associated element.
 */
export function generateManifest(items: Uint8Array[]) {
  const manifest = new Uint8Array(4 + items.length * 4)
  manifest.set(numberToUint32LE(items.length))
  items.forEach((item, index) => {
    manifest.set(numberToUint32LE(item.byteLength), 4 + index * 4)
  })
  return manifest
}
