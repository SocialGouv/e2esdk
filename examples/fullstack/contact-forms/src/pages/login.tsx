import {
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React from 'react'

const LoginPage: NextPage = () => {
  const [userId, setUserId] = React.useState('')
  const [deviceRegistrationURI, setDeviceRegistrationURI] = React.useState('')
  const router = useRouter()
  const client = useE2ESDKClient()
  const login = React.useCallback(async () => {
    if (deviceRegistrationURI) {
      const identity = await client.registerEnrolledDevice(
        deviceRegistrationURI
      )
      if (!identity) {
        throw new Error('Failed to login')
      }
    } else {
      await client.login(userId)
    }
    await router.push('/app/contact-forms')
  }, [userId, deviceRegistrationURI, client, router])

  return (
    <>
      <Heading as="h1">Log in</Heading>
      <Stack spacing={4} mt={8}>
        <FormControl>
          <FormLabel>User ID</FormLabel>
          <Input
            fontFamily="mono"
            value={userId}
            onChange={e => setUserId(e.target.value)}
          />
        </FormControl>
        <Text>---- OR ----</Text>
        <FormControl>
          <FormLabel>Device registration URI</FormLabel>
          <Input
            fontFamily="mono"
            value={deviceRegistrationURI}
            onChange={e => setDeviceRegistrationURI(e.target.value)}
          />
        </FormControl>
        <Divider />
        <Button type="submit" onClick={login}>
          Log in
        </Button>
      </Stack>
    </>
  )
}

export default LoginPage
