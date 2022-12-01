import { useToast } from '@chakra-ui/react'
import { APIError, PublicUserIdentity } from '@e2esdk/client'
import { useE2ESDKClient } from '@e2esdk/react'
import React from 'react'

export function useShareKey() {
  const client = useE2ESDKClient()
  const toast = useToast({
    position: 'bottom-right',
  })

  return React.useCallback(
    async (
      keyNameFingerprint: string | null,
      to: PublicUserIdentity | null
    ) => {
      if (!keyNameFingerprint || !to) {
        return
      }
      try {
        await client.shareKey(keyNameFingerprint, to)
        toast({
          status: 'success',
          title: 'Key shared',
          description: `Key ${keyNameFingerprint} was sent to ${to.userId}`,
        })
      } catch (error) {
        if (error instanceof APIError) {
          if (error.statusCode === 409) {
            toast({
              status: 'info',
              title: 'Not needed',
              description: error.message,
            })
          } else {
            toast({
              status: 'error',
              title: error.statusText,
              description: error.message,
            })
          }
        } else {
          toast({
            status: 'error',
            title: (error as any).name,
            description: (error as any).message ?? String(error),
          })
        }
      }
    },
    [client, toast]
  )
}
