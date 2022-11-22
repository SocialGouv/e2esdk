import {
  CloseButton,
  FormControl,
  FormControlProps,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
} from '@chakra-ui/react'
import type { PublicUserIdentity } from '@e2esdk/client'
import { useE2ESDKClient } from '@e2esdk/react'
import React from 'react'

type UserIdentityInputProps = FormControlProps & {
  label?: string
  identity: PublicUserIdentity | null
  onIdentityChange: (identity: PublicUserIdentity | null) => void
  showPublicKey?: boolean
}

export const UserIdentityInput: React.FC<UserIdentityInputProps> = ({
  label = 'User ID',
  identity,
  onIdentityChange,
  showPublicKey = true,
  ...props
}) => {
  const client = useE2ESDKClient()
  const [userId, setUserId] = React.useState(identity?.userId ?? '')
  const [isLoading, setIsLoading] = React.useState(false)
  const [publicKey, setPublicKey] = React.useState<string | null>(null)

  const fetchIdentity = React.useCallback(async () => {
    if (!userId.trim()) {
      onIdentityChange(null)
      setPublicKey(null)
      return
    }
    setIsLoading(true)
    try {
      const identity = await client.getUserIdentity(userId)
      onIdentityChange(identity)
      setPublicKey(identity?.signaturePublicKey ?? null)
    } finally {
      setIsLoading(false)
    }
  }, [client, userId, onIdentityChange])

  return (
    <FormControl {...props}>
      <FormLabel>{label}</FormLabel>
      <InputGroup>
        <Input
          value={userId}
          onChange={e => setUserId(e.target.value)}
          onBlur={fetchIdentity}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              fetchIdentity()
            }
          }}
        />
        <InputRightElement>
          {isLoading ? (
            <Spinner />
          ) : Boolean(identity) ? (
            <CloseButton
              size="sm"
              rounded="full"
              onClick={() => {
                setUserId('')
                onIdentityChange(null)
                setPublicKey(null)
              }}
            />
          ) : null}
        </InputRightElement>
      </InputGroup>
      {showPublicKey && publicKey && (
        <FormHelperText>Public key: {publicKey}</FormHelperText>
      )}
    </FormControl>
  )
}
