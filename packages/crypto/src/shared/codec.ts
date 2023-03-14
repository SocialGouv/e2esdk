export function base64UrlEncode(input: Uint8Array): string {
  if (typeof window === 'undefined') {
    // Node.js
    return Buffer.from(input).toString('base64url')
  } else {
    // Browser
    return (
      window
        .btoa(String.fromCharCode(...input))
        // Convert to base64url
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/={1,2}$/, '')
    )
  }
}

export function base64UrlDecode(input: string): Uint8Array {
  if (typeof window === 'undefined') {
    // Node.js
    return new Uint8Array(Buffer.from(input, 'base64url'))
  } else {
    // Browser
    return new Uint8Array(
      // convert base64url to base64 for atob
      window
        .atob(input.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(x => x.charCodeAt(0))
    )
  }
}

export function numberToIEEE754Bytes(input: number) {
  const buffer = new ArrayBuffer(8)
  const f64 = new Float64Array(buffer)
  f64[0] = input
  return new Uint8Array(buffer)
}

export function ieee754BytesToNumber(bytes: Uint8Array) {
  if (bytes.byteLength !== 8) {
    return NaN
  }
  const f64 = new Float64Array(bytes.buffer)
  return f64[0]
}

/**
 * XOR all the bits of the buffer together, and convert the result to a boolean.
 * @returns true if there is an odd number of bits set in the buffer.
 */
export function _xor(buffer: Uint8Array) {
  let out = 0
  for (const byte of buffer) {
    for (let i = 0; i < 8; ++i) {
      out ^= (byte >> i) & 0x01
    }
  }
  return out === 1
}

/**
 * Hide a boolean in a buffer of random bytes
 *
 * The premise of this encoding is that the output buffer must XOR to the
 * desired boolean state.
 * We do this by generating 32 bytes of randomness, and making sure it
 * XORs to the right state by flipping a random bit if necessary.
 *
 * @returns 32 bytes of randomness, which XORs to the desired boolean
 */
export function boolToBytes(input: boolean) {
  // We start with 1 + 32 bytes of randomness
  const bytes = new Uint8Array(33)
  crypto.getRandomValues(bytes)
  // The first one is our 'address' byte
  const address = bytes[0]
  // We clear it in the buffer after use
  bytes[0] = 0x00
  // The next 32 bytes are what we're going to return
  const data = bytes.slice(1)
  // We're going to use our address byte as the index of the
  // the bit to flip in the array of bytes.
  // The last 3 bits of the address byte (0-7) give us
  // the bit index within a particular byte:
  const b = address & 0x03
  // The other 5 bits (0-31) give us the index of the byte
  // where to apply the flip:
  const B = (address >> 3) & 0x1f
  // First, we compute the XOR of all the bits in our output data
  const x = _xor(data)
  // If the XOR is equal to our desired state, nothing to do,
  // otherwise, we set the bit mask based on our bit index `b`
  const m = (input === x ? 0 : 1) << b
  // Finally, we (possibly) flip the byte `B` with our mask
  data[B] ^= m
  return data
}

// Decoding is trivial: XOR all bits together to expose the boolean.
export const bytesToBool = _xor

export function numberToUint32LE(input: number) {
  const buffer = new ArrayBuffer(4)
  const u32 = new Uint32Array(buffer)
  u32[0] = input
  return new Uint8Array(buffer)
}
