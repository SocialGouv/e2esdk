import type { Client, PublicUserIdentity } from '@socialgouv/e2esdk-client'
import React from 'react'

const E2ESDKClientContext = React.createContext<Client | null>(null)

type E2ESDKClientProviderProps = {
  client: Client
  children: React.ReactNode
}

export const E2ESDKClientProvider: React.FC<E2ESDKClientProviderProps> = ({
  client,
  children,
}) => (
  <E2ESDKClientContext.Provider value={client}>
    {children}
  </E2ESDKClientContext.Provider>
)

export function useE2ESDKClient() {
  const ctx = React.useContext(E2ESDKClientContext)
  if (!ctx) {
    throw new Error(
      'useE2ESDKClient must be called under a E2ESDKClientProvider'
    )
  }
  return ctx
}

// --

export function useE2ESDKClientIdentity() {
  const client = useE2ESDKClient()
  const [identity, setIdentity] = React.useState<PublicUserIdentity | null>(
    () => client.publicIdentity
  )
  React.useEffect(() => {
    return client.on('identityUpdated', identity => setIdentity(identity))
  }, [client])
  return identity
}

export function useE2ESDKClientKeys() {
  const client = useE2ESDKClient()
  const [keys, setKeys] = React.useState(() => client.keys)
  React.useEffect(() => {
    return client.on('keychainUpdated', () => setKeys(client.keys))
  }, [client])
  return keys
}
