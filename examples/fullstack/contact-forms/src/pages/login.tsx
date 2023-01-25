import {
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React from 'react'

const LoginPage: NextPage = () => {
  const [userId, setUserId] = React.useState('')
  const [mainKey, setMainKey] = React.useState('')
  const router = useRouter()
  const client = useE2ESDKClient()
  const login = React.useCallback(async () => {
    await client.login(userId, client.decode(mainKey))
    await router.push('/app/contact-forms')
  }, [userId, mainKey, client, router])

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
        <FormControl>
          <FormLabel>Main Key</FormLabel>
          <Input
            value={mainKey}
            onChange={e => setMainKey(e.target.value)}
            type="password"
            pattern="[\w-]{43}"
          />
        </FormControl>
        <Button type="submit" onClick={login}>
          Log in
        </Button>
      </Stack>
    </>
  )
}

export default LoginPage
