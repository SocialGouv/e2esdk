import { useE2ESDKClient } from '@e2esdk/react'
import React from 'react'
import './web-component'

export type DevtoolsProps = {
  theme?: 'light' | 'dark'
}

export const E2ESDKDevtools: React.FC<DevtoolsProps> = ({ theme = 'dark' }) => {
  const client = useE2ESDKClient()
  return (
    <e2esdk-devtools
      serverURL={client.config.serverURL}
      serverPublicKey={client.encode(client.config.serverPublicKey)}
      theme={theme}
    />
  )
}
