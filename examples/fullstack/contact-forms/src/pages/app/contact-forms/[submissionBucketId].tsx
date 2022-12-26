import {
  Box,
  Button,
  Center,
  ChakraComponent,
  ChakraProps,
  Divider,
  Flex,
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
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from '@chakra-ui/react'
import type { KeychainItemMetadata } from '@socialgouv/e2esdk-client'
import { useE2ESDKClient, useE2ESDKClientKeys } from '@socialgouv/e2esdk-react'
import { useQuery } from '@tanstack/react-query'
import { CopiableReadOnlyInput } from 'components/CopiableReadOnlyInput'
import { NoSSR } from 'components/NoSSR'
import request, { gql } from 'graphql-request'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React, { KeyboardEventHandler, ReactEventHandler, useRef } from 'react'
import { FiCheck, FiMail, FiPhone } from 'react-icons/fi'
import { z } from 'zod'
import { ShareAccess } from './new'
import {
  base64UrlDecode,
  encrypt,
  encryptFormData,
  initializeEncryptedFormLocalState,
  multipartSignature,
  SealedBoxCipher,
  SecretBoxCipher,
} from '@socialgouv/e2esdk-crypto'
import { useShareKey } from 'hooks/useShareKey'

// https://github.com/colinhacks/zod/issues/310
const emptyStringToUndefined = z.literal('').transform(() => undefined)
function asOptionalField<T extends z.ZodTypeAny>(schema: T) {
  return schema.optional().or(emptyStringToUndefined)
}

const formSchema = z.object({
  subject: z.string(),
  message: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().nullish(),
  contactMe: z.boolean(),
  email: asOptionalField(z.string().email()),
  phoneNumber: z.string().nullish(),
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

const commentSchema = z.object({
  content: z.string(),
  authorName: z.string(),
})

type CommentValues = z.infer<typeof commentSchema>
type SubmitCommentVariables = {
  submissionBucketId: string
  submissionId: number
  signature: string
  sealedSecret: string
  publicKey: string
} & {
  [K in keyof CommentValues]: CommentValues[K] extends null
    ? string | undefined
    : string
}

type CommentBoxProps = ChakraProps & {
  submissionId: number
}

const CommentBox: React.FC<CommentBoxProps> = ({ submissionId, ...rest }) => {
  const router = useRouter()
  const submissionBucketId = router.query.submissionBucketId as string

  const comments = [
    {
      createdAt: '2022-12-26T10:10:20.19336+00:00',
      authorName: 'andré',
      content: 'blablalala',
    },
    {
      createdAt: '2022-12-26T10:10:20.19336+00:00',
      authorName: 'lauren',
      content: 'blablalala zefze zefze zeg  zgerzg erg  er',
    },
    {
      createdAt: '2022-12-26T10:10:20.19336+00:00',
      authorName: 'chris',
      content: 'blablalala zefze zefze zeg  zgerzg erg  er',
    },
  ]
  //  const shareKey = useShareKey()
  const allKeys = useE2ESDKClientKeys()

  const onSendMessage: ReactEventHandler = async e => {
    const inputValue = input && input.current && input.current.value
    if (inputValue) {
      console.log('send', submissionBucketId, submissionId, inputValue)

      console.log(
        'should submit encrypted and shared comment on that submission'
      )

      // TODO

      // encrypt some obj
      const encrypted = client.encryptObject({
        authorName: 'me',
        content: inputValue,
      })

      // push to hasura
      const variables = {}
      const res = await request<CommentResponseData>(
        'http://localhost:4002/v1/graphql', // todo: Use env
        SUBMIT_COMMENT_MUTATION,
        variables
      )
    }
  }

  const onKeyDown: KeyboardEventHandler = e => {
    if (e.key === 'Enter') {
      onSendMessage(e)
    }
  }
  const input = React.useRef<HTMLTextAreaElement>(null)
  return (
    <Box {...rest}>
      <b>Commentaires:</b>
      <br />
      {comments.map(comment => (
        <li style={{ listStyleType: 'none' }}>
          <b>{comment.authorName}</b>
          <br />
          {comment.content}
        </li>
      ))}
      <Textarea onKeyDown={onKeyDown} ref={input} w="100%" h="100px" />
      <Button onClick={onSendMessage}>Envoyer</Button>
    </Box>
  )
}

const SubmissionDetails: React.FC<TableRowProps> = ({ data }) => {
  return (
    <ModalContent h="600px" w="1000px">
      <ModalHeader>{data.subject}</ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        <Flex>
          <Box w="100%">
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
            <Divider my={4} />
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
          </Box>
          <CommentBox submissionId={data.id} w="350px" />
        </Flex>
      </ModalBody>
      <ModalFooter gap={4}></ModalFooter>
    </ModalContent>
  )
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
      </Tr>
      <Modal isOpen={isOpen} onClose={onClose} size="6xl">
        <ModalOverlay />
        <SubmissionDetails data={data} />
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
        res.contactFormSubmissions?.map(
          ({
            id,
            createdAt,
            publicKey,
            sealedSecret,
            signature,
            ...encryptedFields
          }) => {
            const decrypted = client.unsealFormData(
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
            return formWithMetadata.parse({
              id,
              createdAt,
              ...decrypted,
            })
          }
        ) ?? []
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
    }
  }
`

// TODO
const SUBMIT_COMMENT_MUTATION = gql`
  mutation SubmitComment(
    $submissionBucketId: String!
    $signature: String!
    $sealedSecret: String!
    $publicKey: String!
    $subject: String!
    $message: String!
    $firstName: String!
    $lastName: String!
    $age: String
    $contactMe: String!
    $email: String
    $phoneNumber: String
  ) {
    inserted: insert_contactFormSubmissions_one(
      object: {
        submissionBucketId: $submissionBucketId
        signature: $signature
        sealedSecret: $sealedSecret
        publicKey: $publicKey
        subject: $subject
        message: $message
        firstName: $firstName
        lastName: $lastName
        age: $age
        contactMe: $contactMe
        email: $email
        phoneNumber: $phoneNumber
      }
    ) {
      id
    }
  }
`
