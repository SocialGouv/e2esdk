import {
  Box,
  Center,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Icon,
  Link,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react'
import { useE2ESDKClient, useE2ESDKClientKeys } from '@socialgouv/e2esdk-react'
import { CopiableReadOnlyInput } from 'components/CopiableReadOnlyInput'
import { NoSSR } from 'components/NoSSR'
import { ShareKeyPopup } from 'components/ShareKey'
import {
  formWithMetadata,
  useContactFormSubmissions,
  useSubmissionBucketIdUrlParam,
} from 'lib/submissions'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React from 'react'
import { FiCheck, FiX } from 'react-icons/fi'
import { z } from 'zod'

const ContactFormResultsPage: NextPage = () => {
  const router = useRouter()
  const submissionBucketId = router.query.submissionBucketId as string
  const allKeys = useE2ESDKClientKeys()
  const currentKey = allKeys[submissionBucketId]?.[0] ?? null
  const submissions = useContactFormSubmissions(currentKey)
  if (!currentKey) {
    return (
      <Center minH="xs">
        <NoSSR fallback={<Spinner />}>No key available for this form</NoSSR>
      </Center>
    )
  }
  return (
    <>
      <Heading as="h1">
        {currentKey.label.replace(/^contact-form:answers:/, '')}
      </Heading>
      <Text fontSize="sm" color="gray.500">
        Contact form submissions
      </Text>
      <Flex gap={8} alignItems="center">
        <FormControl mt={8}>
          <FormLabel>Public URL</FormLabel>
          <CopiableReadOnlyInput
            value={`http://localhost:4000/contact-form/${submissionBucketId}#${currentKey.publicKey}`}
            size="sm"
          />
          <FormHelperText>
            Anyone with this URL will be able to contact you
          </FormHelperText>
        </FormControl>
        <ShareKeyPopup
          mt={8}
          ml="auto"
          nameFingerprint={submissionBucketId}
        ></ShareKeyPopup>
      </Flex>
      <Box minH="xs" mt={8}>
        {(submissions.data?.decrypted.length ?? 0) === 0 ? (
          <Center>No data available yet.</Center>
        ) : (
          <Box>
            <TableContainer>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>From</Th>
                    <Th>Subject</Th>
                    <Th>Message</Th>
                    <Th textAlign="center">ID</Th>
                    <Th isNumeric>Age</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                    <Th>Received</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(submissions.data?.decrypted ?? []).map(submission => (
                    <TableRow key={submission.id} data={submission} />
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
            {(submissions.data?.dropped ?? 0) > 0 && (
              <Text mt={4} fontSize="xs" color="yellow.500">
                ⚠️ {submissions.data!.dropped} invalid submission
                {submissions.data!.dropped > 1 ? 's were ' : ' was '}
                ignored. Check the console for more details.
              </Text>
            )}
          </Box>
        )}
      </Box>
    </>
  )
}

export default ContactFormResultsPage

// --

const NotAvailable = () => {
  return (
    <Text
      color="gray.500"
      _before={{
        content: '"--"',
      }}
      aria-label="N.A."
    />
  )
}

// --

type TableRowProps = {
  data: z.infer<typeof formWithMetadata>
}

const TableRow: React.FC<TableRowProps> = ({ data, ...props }) => {
  const router = useRouter()
  const submissionBucketId = useSubmissionBucketIdUrlParam()
  return (
    <Tr
      _hover={{
        background: 'gray.50',
        _dark: {
          background: 'gray.900',
        },
      }}
      onClick={() =>
        router.push(`/app/contact-forms/${submissionBucketId}/${data.id}`)
      }
      cursor="pointer"
    >
      <Td fontWeight="semibold">
        {data.firstName} {data.lastName}
      </Td>
      <Td
        maxW="2xs"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {data.subject}
      </Td>
      <Td
        maxW="xs"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {data.message}
      </Td>
      <Td textAlign="center">
        {Boolean(data.proofOfIdentity) ? (
          <Icon as={FiCheck} aria-label="yes" color="green.500" />
        ) : (
          <Icon as={FiX} aria-label="no" color="red.500" />
        )}
      </Td>
      <Td isNumeric>{data.age ?? <NotAvailable />}</Td>
      <Td>
        {data.email ? (
          <Link href={`mailto:${data.email}`}>{data.email}</Link>
        ) : (
          <NotAvailable />
        )}
      </Td>
      <Td>
        {data.phoneNumber ? (
          <Link href={`tel:${data.phoneNumber}`}>{data.phoneNumber}</Link>
        ) : (
          <NotAvailable />
        )}
      </Td>
      <Td color="gray.500" fontSize="xs">
        {data.createdAt.toLocaleString(['se-SE'])}
      </Td>
    </Tr>
  )
}
