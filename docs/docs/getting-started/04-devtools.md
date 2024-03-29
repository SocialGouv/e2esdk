# Devtools

## With React

Create a `Devtools` React component :

```tsx
import '@socialgouv/e2esdk-devtools'
import { E2ESDKDevtoolsElement } from '@socialgouv/e2esdk-devtools'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'

export const Devtools = () => {
  const client = useE2ESDKClient()
  const ref = React.useRef<E2ESDKDevtoolsElement>(null)
  React.useEffect(() => {
    if (!ref.current) {
      return
    }
    ref.current.client = client
  }, [client])
  return <e2esdk-devtools ref={ref} theme="dark" />
}
```

Add it inside your `E2ESDKClientProvider`. see [React integration](./03-react.md)

```tsx
<E2ESDKClientProvider client={e2esdkClient}>
  <MyApp />
  <Devtools />
</E2ESDKClientProvider>
```
