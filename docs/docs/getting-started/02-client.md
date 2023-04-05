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
  serverURL: 'https://localhost:3001',
  // Pass the signature public key you configured for the server
  serverPublicKey: 'gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE',
})
```
