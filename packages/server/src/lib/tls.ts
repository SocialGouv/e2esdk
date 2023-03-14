import fs from 'node:fs'
import { ServerOptions } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function getTLSConfig(): ServerOptions {
  const certDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../certs'
  )
  try {
    return {
      minVersion: 'TLSv1.3',
      cert: fs.readFileSync(path.resolve(certDir, 'tls.crt')),
      key: fs.readFileSync(path.resolve(certDir, 'tls.key')),
    }
  } catch {
    console.error(`Failed to read TLS certificate/key file(s) from ${certDir}`)
    process.exit(1)
  }
}
