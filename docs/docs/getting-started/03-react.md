# Using React

If you're using React, you may want to also install the React bindings:

```shell
pnpm add @socialgouv/e2esdk-react
```

This package provides:

- A context to pass the client throughout your application
- A series of hooks to access the client and its underlying data reactively, such as user identity or the list of available keys.

## Usage with Next.js

In the case of Next.js, client initialisation should be located at the top-level
of a file imported by `_app.tsx` _(or in `_app.tsx` itself)_:

```tsx title="_app.tsx"
import { Client } from '@socialgouv/e2esdk-client'
import { E2ESDKClientProvider } from '@socialgouv/e2esdk-react'

const e2esdkClient = new Client({
  serverURL: 'http://localhost:3001',
  serverPublicKey: 'gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE',
})

function MyNextJsApp({ Component, pageProps }: AppProps) {
  return (
    <E2ESDKClientProvider client={e2esdkClient}>
      <Component {...pageProps} />
    </E2ESDKClientProvider>
  )
}

export default MyNextJsApp
```

## Hooks

### `useE2ESDKClient`

Get direct acess to the e2esdk client instance:

```tsx
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'

const MyComponent = () => {
  const client = useE2ESDKClient()
  const login = React.useCallback(
    (userId, mainKey) => client.login(userId, mainKey),
    [client]
  )
  // ...
}
```

### `useE2ESDKClientIdentity`

Get a reactive `PublicUserIdentity` for the authenticated user, or `null` if
the client is locked:

```tsx
import { useE2ESDKClientIdentity } from '@socialgouv/e2esdk-react'

const MyComponent = () => {
  const whoami = useE2ESDKClientIdentity()
  if (!whoami) {
    return 'Not authenticated'
  }
  return (
    <>
      <p>UserId: {whoami.userId}</p>
      <p>signaturePublicKey: {whoami.signaturePublicKey}</p>
    </>
  )
}
```
