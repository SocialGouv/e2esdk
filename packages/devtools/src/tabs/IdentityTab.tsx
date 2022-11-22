import { BoxProps, Button, Icon, Stack } from '@chakra-ui/react'
import type { PublicUserIdentity } from '@e2esdk/client'
import { useE2ESDKClient, useE2ESDKClientIdentity } from '@e2esdk/react'
import React from 'react'
import { FiLogOut, FiSearch, FiUser } from 'react-icons/fi'
import { Identity } from '../components/Identity'
import {
  Section,
  SectionContainer,
  SectionHeader,
} from '../components/Sections'
import { UserIdentityInput } from '../components/UserIdentityInput'

export const IdentityTab: React.FC = () => {
  return (
    <SectionContainer>
      <FindUsersSection />
      <YourIdentitySection />
    </SectionContainer>
  )
}

// --

const YourIdentitySection = (props: BoxProps) => {
  const client = useE2ESDKClient()
  const identity = useE2ESDKClientIdentity()
  if (!identity) {
    return null
  }
  return (
    <Section {...props}>
      <SectionHeader mt={0} display="flex" alignItems="center">
        <Icon as={FiUser} ml="2px" mr={2} />
        Your identity
        <Button
          marginLeft="auto"
          colorScheme="red"
          variant="ghost"
          rounded="full"
          my={-1}
          size="xs"
          leftIcon={<FiLogOut />}
          onClick={() => client.logout()}
        >
          Log out
        </Button>
      </SectionHeader>
      <Stack spacing={4} px={4}>
        <Identity identity={identity} />
      </Stack>
    </Section>
  )
}

// --

const FindUsersSection = (props: BoxProps) => {
  const [identity, setIdentity] = React.useState<PublicUserIdentity | null>(
    null
  )
  return (
    <Section {...props}>
      <SectionHeader mt={0}>
        <Icon as={FiSearch} mr={2} transform="translateY(2px)" />
        Find users
      </SectionHeader>
      <Stack spacing={4} px={4}>
        <UserIdentityInput
          identity={identity}
          onIdentityChange={setIdentity}
          showPublicKey={false}
        />
        {identity && <Identity identity={identity} />}
      </Stack>
    </Section>
  )
}
