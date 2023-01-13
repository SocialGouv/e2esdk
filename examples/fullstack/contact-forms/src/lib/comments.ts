import {
  identitySchema,
  secretBoxCiphertextV1Schema,
  signatureSchema,
} from '@socialgouv/e2esdk-api'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { useQuery } from '@tanstack/react-query'
import request, { gql } from 'graphql-request'
import { z } from 'zod'

// List comments --

const encryptedComment = z.object({
  id: z.number(),
  createdAt: z.date(),
  author: identitySchema.shape.userId,
  message: secretBoxCiphertextV1Schema('txt'),
  signature: signatureSchema,
})

const decryptedComment = encryptedComment
  .omit({
    message: true,
    signature: true,
  })
  .extend({
    message: z.string(),
  })
type DecryptedComment = z.infer<typeof decryptedComment>

export function getSubmissionCommentsKeyLabel(submissionBucketId: string) {
  return `contact-form:comments:${submissionBucketId}`
}

export function useSubmissionCommentsKey(submissionBucketId: string) {
  const client = useE2ESDKClient()
  const label = getSubmissionCommentsKeyLabel(submissionBucketId)
  return client.findKeyByLabel(label)
}

export function useSubmissionCommentsQuery(
  submissionBucketId: string,
  submissionId: number
) {
  const client = useE2ESDKClient()
  const currentKey = useSubmissionCommentsKey(submissionBucketId)
  return useQuery({
    queryKey: ['contact-forms', 'comments', submissionBucketId, submissionId],
    async queryFn() {
      const queryResult = z.object({
        contactFormComments: z.array(encryptedComment),
      })
      const { contactFormComments } = queryResult.parse(
        await request<z.infer<typeof queryResult>>(
          'http://localhost:4002/v1/graphql',
          SUBMISSION_COMMENTS_QUERY,
          {
            submissionId,
          }
        )
      )
      const decrypted = contactFormComments
        .map(({ message, signature, ...comment }) => {
          // todo: Verify signature
          const decryptedMessage = client.decrypt(
            message,
            currentKey!.nameFingerprint
          )
          const res = decryptedComment.safeParse({
            ...comment,
            message: decryptedMessage,
          })
          if (res.success) {
            return res.data
          }
          console.warn({
            _: 'Dropping invalid comment:',
            comment,
            reason: res.error,
          })
          // @ts-expect-error
          return null as DecryptedComment
        })
        .filter(Boolean)
      return {
        decrypted,
        dropped: contactFormComments.length - decrypted.length,
      }
    },
    enabled: !!currentKey,
  })
}

const SUBMISSION_COMMENTS_QUERY = gql`
  query SubmissionComments($submissionId: Int!) {
    contactFormComments(where: { submissionId: { _eq: $submissionId } }) {
      id
      createdAt
      author
      message
      signature
    }
  }
`

// Create comment --

export function useCreateCommentMutation(
  submissionBucketId: string,
  submissionId: number
) {}
