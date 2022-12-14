#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import './env.js'
import { createServer, startServer } from './server.js'

export async function main() {
  // Setup environment
  const appServer = createServer()
  await startServer(appServer)
}

// --

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
