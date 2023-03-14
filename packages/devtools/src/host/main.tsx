import { Client } from '@socialgouv/e2esdk-client'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index'
import { E2ESDKDevtoolsElement } from '../index'
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

const Main = () => {
  const lightDevtoolsRef = React.useRef<E2ESDKDevtoolsElement>(null)

  React.useEffect(() => {
    if (!lightDevtoolsRef.current) {
      return
    }
    lightDevtoolsRef.current.client = client
  }, [])

  return (
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
            // This shows how to reuse an existing client
            // by passing it as a Property (see useEffect above)
            ref={lightDevtoolsRef}
            theme="light"
          />
        </div>
        {/* <div style={{ flex: 1 }}>
          <e2esdk-devtools
            // This devtools will embed its own client
            serverURL={__DEPLOYMENT_URL__}
            serverPublicKey={__SIGNATURE_PUBLIC_KEY__}
            theme="dark"
            reactQueryDevtools
          />
        </div> */}
      </div>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <Main />
)
