import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import type { NextPage } from 'next'
import React from 'react'

const EnrollDevicePage: NextPage = () => {
  const [label, setLabel] = React.useState<string | undefined>()
  const [uri, setUri] = React.useState<string | undefined>()
  const client = useE2ESDKClient()
  const enroll = React.useCallback(async () => {
    const uri = await client.enrollNewDevice(label)
    setUri(uri)
  }, [label, client])

  return (
    <>
      <Heading as="h1">Enroll new device</Heading>
      <Stack spacing={4} mt={8}>
        {Boolean(uri) ? (
          <Text fontFamily="mono" fontSize="xs">
            {uri}
          </Text>
        ) : (
          <>
            <FormControl>
              <FormLabel>Device label</FormLabel>
              <Input
                fontFamily="mono"
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
              <FormHelperText>
                What shall we call the new device?
              </FormHelperText>
            </FormControl>
            <Button type="submit" onClick={enroll}>
              Enroll new device
            </Button>
          </>
        )}
      </Stack>
    </>
  )
}

export default EnrollDevicePage
