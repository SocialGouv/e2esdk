import {
  identitySchema,
  secretBoxCiphertextV1Schema,
  signatureSchema,
} from '@socialgouv/e2esdk-api'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import request, { gql } from 'graphql-request'
import { z } from 'zod'

// List comments --

const encryptedComment = z.object({
  id: z.number(),
  createdAt: z.string().transform(str => new Date(str)),
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
export type DecryptedComment = z.infer<typeof decryptedComment>

type CommentsQueryCacheType = {
  decrypted: DecryptedComment[]
  dropped: number
}

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
  return useQuery<CommentsQueryCacheType>({
    queryKey: ['contact-forms', 'comments', submissionBucketId, submissionId],
    async queryFn() {
      const queryResult = z.object({
        contactFormComments: z.array(encryptedComment),
      })
      const { contactFormComments } = await request<
        z.infer<typeof queryResult>
      >('http://localhost:4002/v1/graphql', SUBMISSION_COMMENTS_QUERY, {
        submissionId,
      })

      const decrypted = contactFormComments
        .map(({ message, signature, ...comment }) => {
          // todo: Verify signature
          // todo: Add decryption error handling
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
) {
  const key = useSubmissionCommentsKey(submissionBucketId)
  const client = useE2ESDKClient()
  const queryClient = useQueryClient()
  return useMutation({
    async mutationFn(comment: string) {
      if (!key) {
        throw new Error('No available key to encrypt comment')
      }
      const createdAt = new Date().toISOString()
      const author = client.publicIdentity!.userId
      const message = client.encrypt(comment, key.nameFingerprint)
      const signature = client.sign(
        submissionBucketId,
        submissionId.toFixed(),
        createdAt,
        author,
        message
      )
      type MutationResult = {
        comment: {
          id: number
        }
      }
      const {
        comment: { id },
      } = await request<MutationResult>(
        'http://localhost:4002/v1/graphql',
        CREATE_COMMENT_MUTATION,
        {
          submissionBucketId,
          submissionId,
          author,
          createdAt,
          message,
          signature,
        }
      )
      queryClient.setQueryData<CommentsQueryCacheType>(
        ['contact-forms', 'comments', submissionBucketId, submissionId],
        old => {
          const insert = {
            author,
            createdAt: new Date(createdAt),
            id,
            message: comment,
          }
          if (!old) {
            return {
              decrypted: [insert],
              dropped: 0,
            }
          }
          return {
            ...old,
            decrypted: [...old.decrypted, insert],
          }
        }
      )
    },
  })
}

const CREATE_COMMENT_MUTATION = gql`
  mutation CreateComment(
    $submissionBucketId: String = ""
    $submissionId: Int = 10
    $author: String = ""
    $createdAt: timestamptz = ""
    $message: String = ""
    $signature: String = ""
  ) {
    comment: insert_contactFormComments_one(
      object: {
        submissionId: $submissionId
        submissionBucketId: $submissionBucketId
        signature: $signature
        message: $message
        author: $author
        createdAt: $createdAt
      }
    ) {
      id
    }
  }
`
