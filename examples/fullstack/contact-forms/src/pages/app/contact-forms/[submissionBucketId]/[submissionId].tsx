import {
  Box,
  BoxProps,
  Button,
  Center,
  CenterProps,
  Divider,
  Flex,
  FlexProps,
  Heading,
  Link,
  Spinner,
  Stack,
  StackProps,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { EncryptedAvatar } from 'components/EncryptedAvatar'
import {
  DecryptedComment,
  useCreateCommentMutation,
  useSubmissionCommentsKey,
  useSubmissionCommentsQuery,
} from 'lib/comments'
import { downloadAndDecryptFile, saveFile } from 'lib/files'
import {
  formWithMetadata,
  useContactFormSubmission,
  useSubmissionBucketIdUrlParam,
  useSubmissionIdUrlParam,
  useSubmissionsKey,
} from 'lib/submissions'
import type { NextPage } from 'next'
import NextLink from 'next/link'
import React from 'react'
import {
  FiArrowLeft,
  FiDownloadCloud,
  FiPaperclip,
  FiPhone,
  FiSend,
  FiShieldOff,
} from 'react-icons/fi'
import { z } from 'zod'

const SubmissionPage: NextPage = () => {
  const submissionBucketId = useSubmissionBucketIdUrlParam()
  const submissionId = useSubmissionIdUrlParam()
  const submissionsKey = useSubmissionsKey(submissionBucketId)
  const commentsKey = useSubmissionCommentsKey(submissionBucketId)
  const submission = useContactFormSubmission(submissionsKey, submissionId)
  return (
    <Flex flexDirection="column" mx={-4} mt="-5.5rem" mb={-8} h="100vh" pt={14}>
      <Box as="header" px={4} mb={4}>
        <Link as={NextLink} href={`/app/contact-forms/${submissionBucketId}`}>
          <Box
            as={FiArrowLeft}
            display="inline-block"
            transform="translateY(2px)"
            mr={2}
          />
          Back to submissions
        </Link>
      </Box>
      <Flex></Flex>
      <Flex borderTopWidth="1px" flex={1} overflow="auto">
        {submissionsKey ? (
          submission.data ? (
            <SubmissionOverviewPanel data={submission.data} flex={1} />
          ) : (
            <Center flex={1}>
              <Spinner />
            </Center>
          )
        ) : (
          <NoAccess subject="submissions" flex={1} />
        )}
        {commentsKey ? (
          <CommentSection borderLeftWidth="1px" flex={1} />
        ) : (
          <NoAccess subject="comments" borderLeftWidth="1px" flex={1} />
        )}
      </Flex>
    </Flex>
  )
}

export default SubmissionPage

// --

type SubmissionOverviewPanelProps = StackProps & {
  data: z.infer<typeof formWithMetadata>
}

const SubmissionOverviewPanel: React.FC<SubmissionOverviewPanelProps> = ({
  data,
  ...props
}) => {
  const client = useE2ESDKClient()
  return (
    <Stack spacing={4} {...props}>
      <Flex gap={4} as="header" alignItems="center" padding={4} flexWrap="wrap">
        {data.identityPhoto && (
          <EncryptedAvatar metadata={data.identityPhoto} />
        )}
        <Box>
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
          <Text mt={-1}>
            {data.email && (
              <Link
                href={`mailto:${data.email}`}
                fontSize="sm"
                color="gray.500"
              >
                {data.email}
              </Link>
            )}
          </Text>
        </Box>
        <Text ml="auto" fontSize="xs" color="gray.500">
          {data.createdAt.toLocaleString(['se-SE'])}
        </Text>
      </Flex>
      <Heading as="h3" fontSize="2xl" px={4}>
        {data.subject}
      </Heading>
      <Text padding={4}>{data.message}</Text>
      <Divider />
      <Flex as="footer" gap={4} px={4}>
        {data.contactMe && data.phoneNumber && (
          <Button
            as={Link}
            sx={{
              '&:hover': {
                textDecoration: 'none',
              },
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
      </Flex>
    </Stack>
  )
}

// --

type CommentSectionProps = FlexProps & {}

const CommentSection: React.FC<CommentSectionProps> = ({ ...props }) => {
  const submissionBucketId = useSubmissionBucketIdUrlParam()
  const submissionId = useSubmissionIdUrlParam()
  const comments = useSubmissionCommentsQuery(submissionBucketId, submissionId)
  const submit = useCreateCommentMutation(submissionBucketId, submissionId)
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null)

  const onSubmit = React.useCallback(async () => {
    const message = textAreaRef.current?.value.trim()
    if (!message) {
      return
    }
    await submit.mutateAsync(message)
    textAreaRef.current!.value = ''
  }, [submit])

  return (
    <Flex
      flexDirection="column"
      bg="gray.50"
      _dark={{ bg: 'gray.900' }}
      {...props}
    >
      {comments.isLoading && (
        <Center h="xs">
          <Spinner />
        </Center>
      )}
      {comments.data?.decrypted.length === 0 ? (
        <Center h="xs">
          <Text fontSize="sm" color="gray.500">
            No comments on this submission yet
          </Text>
        </Center>
      ) : (
        <Stack spacing={2} padding={4} overflow="auto">
          {comments.data?.decrypted.map(comment => (
            <Comment key={comment.id} data={comment} />
          ))}
        </Stack>
      )}
      <Box
        mt="auto"
        padding={2}
        borderTopWidth="1px"
        bg="white"
        _dark={{
          bg: 'gray.800',
        }}
      >
        <Textarea placeholder="Your comment" ref={textAreaRef} />
        <Flex mt={2}>
          <Button
            size="sm"
            leftIcon={<FiPaperclip />}
            isDisabled
            title="File sharing is not yet implemented"
          >
            Attach file
          </Button>
          <Button
            size="sm"
            leftIcon={<FiSend />}
            ml="auto"
            onClick={onSubmit}
            isLoading={submit.isLoading}
          >
            Send
          </Button>
        </Flex>
      </Box>
    </Flex>
  )
}

// --

type CommentProps = BoxProps & {
  data: DecryptedComment
}

const Comment: React.FC<CommentProps> = ({ data, ...props }) => {
  return (
    <Box {...props}>
      <Flex gap={4} alignItems="baseline">
        <Text fontWeight="semibold">{data.author}</Text>
        <Text fontSize="xs" color="gray.500">
          {data.createdAt.toLocaleString(['se-SE'])}
        </Text>
      </Flex>
      <Text>{data.message}</Text>
    </Box>
  )
}

// --

type NoAccessProps = CenterProps & {
  subject: string
}

const NoAccess: React.FC<NoAccessProps> = ({ subject, ...props }) => {
  return (
    <Center
      fontSize="sm"
      color="gray.500"
      flexDirection="column"
      gap={4}
      textAlign="center"
      px={4}
      {...props}
    >
      <Box as={FiShieldOff} display="block" fontSize="3xl" />
      You do not have the key to access {subject} for this form
    </Center>
  )
}
