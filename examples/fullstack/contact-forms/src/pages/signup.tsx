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

const SignupPage: NextPage = () => {
  const [userId, setUserId] = React.useState('')
  const router = useRouter()
  const client = useE2ESDKClient()
  const signup = React.useCallback(async () => {
    await client.signup(userId)
    await router.push('/app/contact-forms')
  }, [userId, client, router])

  return (
    <>
      <Heading as="h1">Sign up</Heading>
      <Stack spacing={4} mt={8}>
        <FormControl>
          <FormLabel>User ID</FormLabel>
          <Input
            fontFamily="mono"
            value={userId}
            onChange={e => setUserId(e.target.value)}
          />
        </FormControl>
        <Button type="submit" onClick={signup}>
          Sign up
        </Button>
      </Stack>
    </>
  )
}

export default SignupPage
