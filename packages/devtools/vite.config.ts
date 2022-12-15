import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'
import type { TemplateType } from 'rollup-plugin-visualizer/dist/plugin/template-types'
import { defineConfig, PluginOption } from 'vite'

// Read the server .env to extract DEPLOYMENT_URL and SIGNATURE_PUBLIC_KEY

const serverDotEnvFile = path.resolve(__dirname, '../server/.env')

const serverEnv = dotenv.parse(
  fs.existsSync(serverDotEnvFile)
    ? fs.readFileSync(serverDotEnvFile, 'utf-8')
    : `
DEPLOYMENT_URL=http://localhost:3001
SIGNATURE_PUBLIC_KEY=gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE
`
)

// Show `localhost` rather than `127.0.0.1`
// https://vitejs.dev/config/server-options.html#server-host
dns.setDefaultResultOrder('verbatim')

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, 'src/host'),
  cacheDir: path.resolve(__dirname, '.vite'),
  publicDir: false,
  define: {
    __DEPLOYMENT_URL__: JSON.stringify(serverEnv.DEPLOYMENT_URL),
    __SIGNATURE_PUBLIC_KEY__: JSON.stringify(serverEnv.SIGNATURE_PUBLIC_KEY),
  },
  plugins: [react(), ...analyzeBundle(['sunburst', 'treemap', 'network'])],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
  },
})

// --

function analyzeBundle(formats: TemplateType[]) {
  return formats.map(
    format =>
      visualizer({
        filename: `.vite/bundle-analyzer/${format}.html`,
        template: format,
      }) as unknown as PluginOption
  )
}
