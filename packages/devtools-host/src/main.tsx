import { Client } from '@e2esdk/client'
import { E2ESDKClientProvider } from '@e2esdk/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const client = new Client({
  serverURL: import.meta.env.VITE_E2ESDK_SERVER_URL,
  serverPublicKey: import.meta.env.VITE_E2ESDK_SERVER_SIGNATURE_PUBLIC_KEY,
})

declare global {
  interface Window {
    client: Client
  }
}

window.client = client

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <E2ESDKClientProvider client={client}>
      <App />
    </E2ESDKClientProvider>
  </React.StrictMode>
)
