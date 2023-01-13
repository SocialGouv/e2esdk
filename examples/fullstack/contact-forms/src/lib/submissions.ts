import type { Client, KeychainItemMetadata } from '@socialgouv/e2esdk-client'
import { fileMetadataSchema } from '@socialgouv/e2esdk-crypto'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import request, { gql } from 'graphql-request'
import { useRouter } from 'next/router'
import { z } from 'zod'

export function useSubmissionBucketIdUrlParam() {
  const router = useRouter()
  return router.query.submissionBucketId as string
}

export function useSubmissionIdUrlParam() {
  const router = useRouter()
  return parseInt(router.query.submissionId as string)
}

export function useSubmissionsKey(submissionBucketId: string) {
  const client = useE2ESDKClient()
  return client.findKeyByNameFingerprint(submissionBucketId)
}

export const formSchema = z.object({
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

export const formWithMetadata = formSchema.extend({
  id: z.number(),
  createdAt: z.string().transform(value => new Date(value)),
})

type FormValues = z.infer<typeof formWithMetadata>
type Submission = {
  id: number
  sealedSecret: string
  publicKey: string
  signature: string
} & {
  [K in keyof Omit<FormValues, 'id'>]: FormValues[K] extends null
    ? string | null
    : string
}

// --

const queryKeys = {
  submissions: (bucketId: string) =>
    ['contact-forms', 'submissions', bucketId] as const,
  submission: (bucketId: string, submissionId: number) =>
    [...queryKeys.submissions(bucketId), submissionId] as const,
}

export function useContactFormSubmissions(
  currentKey: KeychainItemMetadata | null
) {
  const client = useE2ESDKClient()
  const queryClient = useQueryClient()
  return useQuery({
    enabled: Boolean(currentKey),
    queryKey: queryKeys.submissions(currentKey?.nameFingerprint ?? 'N.A.'),
    queryFn: async ({ queryKey }) => {
      if (!currentKey) {
        return { decrypted: [], dropped: 0 }
      }
      const { 2: submissionBucketId } = queryKey
      type QueryResult = {
        submissions: Array<Submission>
      }
      const res = await request<QueryResult>(
        'http://localhost:4002/v1/graphql',
        GET_CONTACT_FORM_SUBMISSIONS_QUERY,
        {
          submissionBucketId,
        }
      )
      const decrypted =
        res.submissions
          ?.map(submission => {
            const decrypted = decryptSubmission(submission, currentKey, client)
            if (decrypted) {
              // Update individual submission query cache
              queryClient.setQueryData(
                queryKeys.submission(currentKey.nameFingerprint, decrypted.id),
                decrypted
              )
            }
            return decrypted as FormValues
          })
          .filter(Boolean) ?? []
      return {
        decrypted,
        dropped: res.submissions.length - decrypted.length,
      }
    },
  })
}

const GET_CONTACT_FORM_SUBMISSIONS_QUERY = gql`
  query GetContactFormSubmissions($submissionBucketId: String!) {
    submissions: contactFormSubmissions(
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

export function useContactFormSubmission(
  currentKey: KeychainItemMetadata | undefined,
  submissionId: number
) {
  const client = useE2ESDKClient()
  return useQuery({
    enabled: Boolean(currentKey),
    queryKey: queryKeys.submission(
      currentKey?.nameFingerprint ?? 'N.A.',
      submissionId
    ),
    queryFn: async ({ queryKey }) => {
      if (!currentKey) {
        return null
      }
      const { 3: submissionId } = queryKey
      type QueryResult = {
        submission: Submission | null
      }
      const res = await request<QueryResult>(
        'http://localhost:4002/v1/graphql',
        GET_CONTACT_FORM_SUBMISSION_QUERY,
        {
          submissionId,
        }
      )
      if (!res.submission) {
        return null
      }
      return decryptSubmission(res.submission, currentKey, client)
    },
  })
}

const GET_CONTACT_FORM_SUBMISSION_QUERY = gql`
  query GetContactFormSubmission($submissionId: Int!) {
    submission: contactFormSubmissions_by_pk(id: $submissionId) {
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

function decryptSubmission(
  {
    id,
    createdAt,
    publicKey,
    sealedSecret,
    signature,
    ...encryptedFields
  }: Submission,
  key: KeychainItemMetadata,
  client: Client
) {
  const values = client.unsealFormData(
    {
      metadata: {
        publicKey,
        sealedSecret,
        signature,
      },
      encrypted: encryptedFields,
    },
    key.nameFingerprint
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
    return null
  }
  return res.data
}
