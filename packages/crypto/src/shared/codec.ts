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
