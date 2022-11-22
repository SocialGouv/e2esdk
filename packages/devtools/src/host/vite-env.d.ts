/// <reference types="vite/client" />

// Server env vars injected as globals using Vite's `define` option
declare const __DEPLOYMENT_URL__: string
declare const __SIGNATURE_PUBLIC_KEY__: string
