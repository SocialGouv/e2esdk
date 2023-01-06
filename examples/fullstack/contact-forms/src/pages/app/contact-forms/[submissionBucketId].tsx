import {
  Avatar,
  AvatarProps,
  Button,
  Center,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Icon,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from '@chakra-ui/react'
import type { KeychainItemMetadata } from '@socialgouv/e2esdk-client'
import { FileMetadata, fileMetadataSchema } from '@socialgouv/e2esdk-crypto'
import { useE2ESDKClient, useE2ESDKClientKeys } from '@socialgouv/e2esdk-react'
import { useQuery } from '@tanstack/react-query'
import { CopiableReadOnlyInput } from 'components/CopiableReadOnlyInput'
import { NoSSR } from 'components/NoSSR'
import request, { gql } from 'graphql-request'
import { downloadAndDecryptFile, saveFile } from 'lib/files'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React from 'react'
import { FiCheck, FiDownloadCloud, FiMail, FiPhone, FiX } from 'react-icons/fi'
import { z } from 'zod'
import { ShareAccess } from './new'

const formSchema = z.object({
  subject: z.string(),
  message: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().nullish(),
  contactMe: z.boolean(),
  email: z.string().email().nullish(),
  phoneNumber: z.string().nullish(),
  proofOfIdentity: fileMetadataSchema.nullish(),
  identityPhoto: fileMetadataSchema.nullish(),
})

const formWithMetadata = formSchema.extend({
  id: z.number(),
  createdAt: z.string().transform(value => new Date(value)),
})

type FormValues = z.infer<typeof formWithMetadata>
type QueryResult = {
  contactFormSubmissions: Array<
    {
      id: number
      sealedSecret: string
      publicKey: string
      signature: string
    } & {
      [K in keyof Omit<FormValues, 'id'>]: FormValues[K] extends null
        ? string | null
        : string
    }
  >
}

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
      <Heading as="h1">{currentKey.name.replace(/^contact-form:/, '')}</Heading>
      <Text fontSize="sm" color="gray.500">
        Contact form submissions
      </Text>
      {(submissions.data?.length ?? 0) === 0 ? (
        <Center minH="2xs">No data available yet.</Center>
      ) : (
        <TableContainer>
          <Table size="sm" mt={8}>
            <Thead>
              <Tr>
                <Th>From</Th>
                <Th>Subject</Th>
                <Th>Message</Th>
                <Th isNumeric>Age</Th>
                <Th textAlign="center">Contact</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Received</Th>
                <Th textAlign="center">ID</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(submissions.data ?? []).map(submission => (
                <TableRow key={submission.id} data={submission} />
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}

      <FormControl mt={12}>
        <FormLabel>Public URL</FormLabel>
        <CopiableReadOnlyInput
          value={`http://localhost:4000/contact-form/${submissionBucketId}#${currentKey.publicKey}`}
        />
        <FormHelperText>
          Anyone with this URL will be able to contact you
        </FormHelperText>
      </FormControl>
      <ShareAccess keyNameFingerprint={currentKey.nameFingerprint} mt={8} />
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

const TableRow: React.FC<TableRowProps> = ({ data }) => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const client = useE2ESDKClient()
  return (
    <>
      <Tr
        _hover={{
          background: 'gray.50',
          _dark: {
            background: 'gray.900',
          },
        }}
        onClick={onOpen}
        cursor="pointer"
      >
        <Td>
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
        <Td isNumeric>{data.age ?? <NotAvailable />}</Td>
        <Td textAlign="center">
          {data.contactMe && (
            <Icon as={FiCheck} aria-label="yes" color="green.500" />
          )}
        </Td>
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
        <Td textAlign="center">
          {Boolean(data.proofOfIdentity) ? (
            <Icon as={FiCheck} aria-label="yes" color="green.500" />
          ) : (
            <Icon as={FiX} aria-label="no" color="red.500" />
          )}
        </Td>
      </Tr>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{data.subject}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {data.identityPhoto && (
              <EncryptedAvatar metadata={data.identityPhoto} />
            )}
            <Text fontWeight="semibold">
              {data.firstName} {data.lastName}{' '}
              {Boolean(data.age) && (
                <Text
                  as="span"
                  fontWeight="normal"
                  fontSize="sm"
                  color="gray.500"
                >
                  • {data.age} years old
                </Text>
              )}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {data.createdAt.toLocaleString(['se-SE'])}
            </Text>
            <Divider my={4} />
            <Text whiteSpace="pre-wrap">{data.message}</Text>
          </ModalBody>
          <ModalFooter gap={4}>
            {data.contactMe && data.email && (
              <Button
                as={Link}
                _hover={{
                  textDecoration: 'none',
                }}
                href={`mailto:${data.email}`}
                leftIcon={<FiMail />}
              >
                Send email
              </Button>
            )}
            {data.contactMe && data.phoneNumber && (
              <Button
                as={Link}
                _hover={{
                  textDecoration: 'none',
                }}
                href={`tel:${data.phoneNumber}`}
                leftIcon={<FiPhone />}
              >
                Call
              </Button>
            )}
            {data.proofOfIdentity && (
              <Button
                leftIcon={<FiDownloadCloud />}
                onClick={() =>
                  downloadAndDecryptFile(client.sodium, data.proofOfIdentity!)
                    .then(saveFile)
                    .catch(console.error)
                }
              >
                Download ID
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

// --

function useContactFormSubmissions(currentKey: KeychainItemMetadata | null) {
  const client = useE2ESDKClient()
  return useQuery({
    enabled: Boolean(currentKey),
    queryKey: [
      'contact-forms',
      'submissions',
      { submissionBucketId: currentKey?.nameFingerprint },
    ] as const,
    queryFn: async () => {
      if (!currentKey) {
        return []
      }
      const res = await request<QueryResult>(
        'http://localhost:4002/v1/graphql',
        GET_CONTACT_FORM_SUBMISSIONS_QUERY,
        {
          submissionBucketId: currentKey.nameFingerprint,
        }
      )
      return (
        res.contactFormSubmissions
          ?.map(
            ({
              id,
              createdAt,
              publicKey,
              sealedSecret,
              signature,
              ...encryptedFields
            }) => {
              const values = client.unsealFormData(
                {
                  metadata: {
                    publicKey,
                    sealedSecret,
                    signature,
                  },
                  encrypted: encryptedFields,
                },
                currentKey.nameFingerprint
              )
              const res = formWithMetadata.safeParse({
                id,
                createdAt,
                ...values,
              })
              if (!res.success) {
                console.warn({
                  _: 'Dropping invalid form data:',
                  values,
                  id,
                  reason: res.error,
                })
                // @ts-ignore
                return null as FormValues
              }
              return res.data
            }
          )
          .filter(Boolean) ?? []
      )
    },
  })
}

const GET_CONTACT_FORM_SUBMISSIONS_QUERY = gql`
  query GetContactFormSubmissions($submissionBucketId: String!) {
    contactFormSubmissions(
      where: { submissionBucketId: { _eq: $submissionBucketId } }
    ) {
      id
      createdAt
      subject
      message
      firstName
      lastName
      age
      contactMe
      email
      phoneNumber
      sealedSecret
      signature
      publicKey
      proofOfIdentity
      identityPhoto
    }
  }
`

// --

type EncryptedAvatarProps = Omit<AvatarProps, 'src'> & {
  metadata: FileMetadata
}

const objectURLs: Record<string, string> = {}

const EncryptedAvatar: React.FC<EncryptedAvatarProps> = ({
  metadata,
  ...props
}) => {
  const client = useE2ESDKClient()
  const [src, setSrc] = React.useState<string | undefined>()
  React.useEffect(() => {
    const id = Math.random().toString(36).slice(2)
    downloadAndDecryptFile(client.sodium, metadata)
      .then(file => {
        const objectURL = URL.createObjectURL(file)
        setSrc(objectURL)
        objectURLs[id] = objectURL
      })
      .catch(console.error)
    return () => {
      if (!objectURLs[id]) {
        return
      }
      URL.revokeObjectURL(objectURLs[id])
      delete objectURLs[id]
    }
  }, [metadata, client])
  return <Avatar src={src} {...props} />
}
