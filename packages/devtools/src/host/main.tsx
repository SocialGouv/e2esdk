import { Client } from '@e2esdk/client'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index'
import App from './App'

const client = new Client({
  serverURL: __DEPLOYMENT_URL__,
  serverPublicKey: __SIGNATURE_PUBLIC_KEY__,
})

declare global {
  interface Window {
    client: Client
  }
}

window.client = client

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        inset: 0,
      }}
    >
      <div style={{ flex: 1 }}>
        <e2esdk-devtools
          serverURL={__DEPLOYMENT_URL__}
          serverPublicKey={__SIGNATURE_PUBLIC_KEY__}
          theme="light"
        />
      </div>
      <div style={{ flex: 1 }}>
        <e2esdk-devtools
          serverURL={__DEPLOYMENT_URL__}
          serverPublicKey={__SIGNATURE_PUBLIC_KEY__}
          theme="dark"
        />
      </div>
    </div>
  </React.StrictMode>
)
