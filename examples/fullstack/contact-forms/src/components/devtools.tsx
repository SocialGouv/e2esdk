import '@e2esdk/devtools'
import { E2ESDKDevtoolsElement } from '@e2esdk/devtools'
import { useE2ESDKClient } from '@e2esdk/react'
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
