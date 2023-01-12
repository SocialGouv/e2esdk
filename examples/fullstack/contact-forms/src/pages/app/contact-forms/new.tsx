import {
  Button,
  Collapse,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Stack,
  StackProps,
} from '@chakra-ui/react'
import { PublicUserIdentity } from '@socialgouv/e2esdk-client'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { CopiableReadOnlyInput } from 'components/CopiableReadOnlyInput'
import { LoadingButton } from 'components/LoadingButton'
import { useShareKey } from 'hooks/useShareKey'
import type { NextPage } from 'next'
import NextLink from 'next/link'
import React from 'react'
import { FiArrowRight, FiShare2 } from 'react-icons/fi'

type ContactFormMetadata = {
  submissionBucketId: string
  publicKey: string
}

const NewContactFormPage: NextPage = () => {
  const client = useE2ESDKClient()
  const [name, setName] = React.useState('')
  const [meta, setMeta] = React.useState<ContactFormMetadata | null>(null)
  const keyName = `contact-form:${name}`
  const publicURL = meta
    ? `http://localhost:4000/contact-form/${meta.submissionBucketId}#${meta.publicKey}`
    : null
  const resultsURL = meta
    ? `/app/contact-forms/${meta.submissionBucketId}`
    : null

  const onSubmit = React.useCallback(async () => {
    await client.sodium.ready
    const { nameFingerprint, publicKey } = await client.createKey(
      keyName,
      'sealedBox'
    )
    setMeta({
      submissionBucketId: nameFingerprint,
      publicKey: publicKey!,
    })
  }, [client, keyName])

  return (
    <>
      <Heading as="h1">New contact form</Heading>
      <Collapse in={!publicURL}>
        <FormControl my={8}>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </FormControl>
        <LoadingButton onClick={onSubmit}>Create new form</LoadingButton>
      </Collapse>
      <Collapse in={Boolean(publicURL)}>
        <FormControl mt={8}>
          <FormLabel>Contact form public URL</FormLabel>
          <CopiableReadOnlyInput value={publicURL ?? '#'} />
          <FormHelperText>
            People will use this link to contact you
          </FormHelperText>
        </FormControl>
        <ShareAccess
          keyNameFingerprint={meta?.submissionBucketId ?? 'N.A.'}
          mt={8}
        />
        <Divider my={12} />
        <Button
          as={NextLink}
          href={resultsURL ?? '#'}
          passHref
          w="100%"
          colorScheme="green"
          leftIcon={<FiArrowRight />}
          _hover={{
            textDecoration: 'none',
          }}
        >
          Go to submissions
        </Button>
      </Collapse>
    </>
  )
}

export default NewContactFormPage

// --

type ShareAccessProps = StackProps & {
  keyNameFingerprint: string
}

export const ShareAccess: React.FC<ShareAccessProps> = ({
  keyNameFingerprint,
  ...props
}) => {
  const [to, setTo] = React.useState<PublicUserIdentity | null>(null)
  const shareKey = useShareKey()
  return (
    <Stack {...props}>
      <Heading as="h2" fontSize="2xl">
        Share access
      </Heading>
      {/* <UserIdentity identity={to} onIdentityChange={setTo} /> */}
      <LoadingButton
        onClick={() => shareKey(keyNameFingerprint, to)}
        leftIcon={<FiShare2 />}
      >
        Share access
      </LoadingButton>
    </Stack>
  )
}
