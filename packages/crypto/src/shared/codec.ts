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

export function boolToByte(input: boolean) {
  const byte = new Uint8Array(1)
  crypto.getRandomValues(byte)
  if (input) {
    byte[0] |= 0x01 // set LSB
  } else {
    byte[0] &= 0xfe // clear LSB
  }
  return byte
}

export function byteToBool(byte: Uint8Array) {
  return Boolean(byte[0] & 0x01)
}

export function numberToUint32LE(input: number) {
  const buffer = new ArrayBuffer(4)
  const u32 = new Uint32Array(buffer)
  u32[0] = input
  return new Uint8Array(buffer)
}
