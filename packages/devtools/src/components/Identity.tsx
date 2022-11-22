import { Icon, Stack, StackProps, Text } from '@chakra-ui/react'
import type { PublicUserIdentity } from '@e2esdk/client'
import React from 'react'
import { FiLock, FiPenTool, FiUser } from 'react-icons/fi'

type IdentityProps = StackProps & {
  identity: PublicUserIdentity
}

export const Identity: React.FC<IdentityProps> = ({ identity, ...props }) => {
  return (
    <Stack
      fontFamily="mono"
      fontSize="sm"
      borderWidth="1px"
      px={4}
      py={3}
      rounded="md"
      _light={{
        boxShadow: 'inner',
        background: 'gray.50',
      }}
      _dark={{
        boxShadow: 'rgba(0, 0, 0, 0.3) 0px 2px 6px 1px inset',
        background: 'gray.1000',
        borderColor: 'gray.700',
      }}
      {...props}
    >
      <Text>
        <Icon as={FiUser} mr={3} transform="translateY(2px)" />
        {identity.userId}
      </Text>
      <Text>
        <Icon as={FiLock} mr={3} transform="translateY(2px)" />
        {identity.sharingPublicKey}
      </Text>
      <Text>
        <Icon as={FiPenTool} mr={3} transform="translateY(2px)" />
        {identity.signaturePublicKey}
      </Text>
    </Stack>
  )
}
