# Adding the client

## Dependencies

Install the following dependencies to your application front-end project:

```shell
pnpm add @socialgouv/e2esdk-client
```

## Client instance configuration

The e2esdk client lives as a singleton in your application, so depending on
your front-end framework, you will need to find a place to create this instance
and pass it to the rest of your code:

```ts
import { Client } from '@socialgouv/e2esdk-client'

export const e2esdkClient = new Client({
  // Point it to where your server is listening
  serverURL: 'http://localhost:3001',
  // Pass the signature public key you configured for the server
  serverPublicKey: 'gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE',
})
```

In the case of Next.js, it's best located at the top-level of a file imported
by `_app.tsx` _(or in `_app.tsx` itself)_:

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
