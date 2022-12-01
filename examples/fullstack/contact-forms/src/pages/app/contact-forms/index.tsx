import {
  Button,
  Center,
  Heading,
  Link,
  SkeletonText,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useE2ESDKClientKeys } from '@e2esdk/react'
import { NoSSR } from 'components/NoSSR'
import type { NextPage } from 'next'
import NextLink from 'next/link'

const ContactFormsPage: NextPage = () => {
  const buckets = useContactFormNames()
  return (
    <>
      <Heading as="h1" mb={8}>
        Contact forms
      </Heading>
      <NoSSR fallback={<SkeletonText />}>
        {buckets.length === 0 ? (
          <Center flexDirection="column" gap={4}>
            <Text fontSize="sm" color="gray.500">
              Create your first contact form:
            </Text>
            <Button as={NextLink} href="/app/contact-forms/new">
              Create contact form
            </Button>
          </Center>
        ) : (
          <Stack spacing={6}>
            {buckets.map(({ name, submissionBucketId }) => (
              <Link
                as={NextLink}
                key={submissionBucketId}
                href={`/app/contact-forms/${submissionBucketId}`}
                passHref
                borderWidth="1px"
                rounded="md"
                shadow="md"
                px={4}
                py={3}
                _hover={{
                  textDecoration: 'none',
                  shadow: 'lg',
                }}
              >
                <Heading as="h2" fontSize="xl">
                  {' '}
                  {name.replace(/^contact-form:/, '')}
                </Heading>
              </Link>
            ))}
            <Button as={NextLink} href="/app/contact-forms/new" passHref>
              Create new contact form
            </Button>
          </Stack>
        )}
      </NoSSR>
    </>
  )
}

export default ContactFormsPage

// --

function useContactFormNames() {
  const keys = useE2ESDKClientKeys()
  const contactFormNames = Object.values(keys)
    .filter(([{ name }]) => name.startsWith('contact-form:'))
    .map(([{ name, nameFingerprint }]) => ({
      name,
      submissionBucketId: nameFingerprint,
    }))
  return contactFormNames
}
