import {
  Box,
  Button,
  Center,
  CenterProps,
  Divider,
  Flex,
  FlexProps,
  Heading,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  StackProps,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { EncryptedAvatar } from 'components/EncryptedAvatar'
import { useSubmissionCommentsKey } from 'lib/comments'
import { downloadAndDecryptFile, saveFile } from 'lib/files'
import {
  formWithMetadata,
  useContactFormSubmission,
  useSubmissionBucketIdUrlParam,
  useSubmissionIdUrlParam,
  useSubmissionsKey,
} from 'lib/submissions'
import type { NextPage } from 'next'
import {
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
    <>
      <SimpleGrid columns={2} minH="xl" borderTopWidth="1px" my={-8} mx={-4}>
        {submissionsKey ? (
          submission.data ? (
            <SubmissionOverviewPanel data={submission.data} />
          ) : (
            <Center>
              <Spinner />
            </Center>
          )
        ) : (
          <NoAccess subject="submissions" />
        )}
        {commentsKey ? (
          <CommentSection borderLeftWidth="1px" />
        ) : (
          <NoAccess subject="comments" borderLeftWidth="1px" />
        )}
      </SimpleGrid>
    </>
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
  return (
    <Flex {...props}>
      <Box mt="auto" w="100%" padding={2} borderTopWidth="1px">
        <Textarea placeholder="Your comment" />
        <Flex mt={2}>
          <Button size="sm" leftIcon={<FiPaperclip />} isDisabled>
            Attach file
          </Button>
          <Button size="sm" leftIcon={<FiSend />} ml="auto">
            Send
          </Button>
        </Flex>
      </Box>
    </Flex>
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
