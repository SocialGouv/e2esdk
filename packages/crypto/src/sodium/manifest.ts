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
 * The first byte is the number of elements _(therefore a manifest can only
 * represent up to 255 elements)_.
 *
 * Each subsequent block of 4 bytes is the little-endian 32 bit unsigned
 * representation of the length of an element.
 */
export function generateManifest(items: Uint8Array[]) {
  if (items.length > 255) {
    throw new RangeError('Cannot sign more than 255 elements')
  }
  const manifest = new Uint8Array(1 + items.length * 4)
  manifest[0] = items.length
  items.forEach((item, index) => {
    manifest.set(numberToUint32LE(item.byteLength), 1 + index * 4)
  })
  return manifest
}
