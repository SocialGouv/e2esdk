import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react'
import {
  base64UrlDecode,
  sealBoolean,
  sealNumber,
  sealString,
} from '@e2esdk/crypto'
import request, { gql } from 'graphql-request'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React from 'react'
import { useForm } from 'react-hook-form'
import { FiSend } from 'react-icons/fi'
import { z } from 'zod'

const formSchema = z.object({
  subject: z.string(),
  message: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().optional(),
  contactMe: z.boolean(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>
type SubmitContactFormVariables = {
  submissionBucketId: string
} & {
  [K in keyof FormValues]: FormValues extends undefined
    ? string | undefined
    : string
}

type InsertResponseData = {
  inserted: null | {
    id: string
  }
}

const ContactFormPage: NextPage = () => {
  const publicKey = usePublicKeyInURLHash()
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
    reset: resetForm,
  } = useForm<FormValues>()

  const router = useRouter()
  const submissionBucketId = router.query.submissionBucketId as string
  const toast = useToast({
    position: 'bottom-right',
  })
  const onSubmit = React.useCallback(
    async (values: FormValues) => {
      if (!publicKey || !submissionBucketId) {
        return
      }
      const variables: SubmitContactFormVariables = {
        submissionBucketId,
        firstName: sealString(values.firstName, publicKey),
        lastName: sealString(values.lastName, publicKey),
        age: Number.isInteger(values.age)
          ? sealNumber(values.age!, publicKey)
          : undefined,
        contactMe: sealBoolean(values.contactMe, publicKey),
        email: values.email && sealString(values.email, publicKey),
        phoneNumber:
          values.phoneNumber && sealString(values.phoneNumber, publicKey),
        subject: sealString(values.subject, publicKey),
        message: sealString(values.message, publicKey),
      }
      const res = await request<InsertResponseData>(
        'http://localhost:4002/v1/graphql', // todo: Use env
        SUBMIT_CONTACT_FORM_MUTATION,
        variables
      )
      if (res.inserted?.id) {
        toast({
          status: 'success',
          title: 'Thanks!',
          description: (
            <>
              Your message has been sent.
              {values.contactMe && (
                <>
                  <br />
                  We will contact you back shortly.
                </>
              )}
            </>
          ),
        })
        resetForm()
      }
    },
    [publicKey, submissionBucketId, toast, resetForm]
  )
  return (
    <>
      <Heading as="h1">Contact us</Heading>
      <Text fontSize="sm" color="gray.600" _dark={{ color: 'gray.400' }} mt={1}>
        All provided data is end-to-end encrypted.
      </Text>
      <form onSubmit={handleSubmit(onSubmit)}>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={8} mt={8}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>First name</FormLabel>
              <Input placeholder="Jane" {...register('firstName')} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Last name</FormLabel>
              <Input placeholder="Doe" {...register('lastName')} />
            </FormControl>
            <FormControl>
              <FormLabel>Age</FormLabel>
              <Input
                type="number"
                placeholder="42"
                {...register('age', { valueAsNumber: true })}
              />
            </FormControl>
            <Checkbox {...register('contactMe')} py={2}>
              I would like to be contacted back
            </Checkbox>
            {watch('contactMe') && (
              <>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    placeholder="jane.doe@example.com"
                    {...register('email')}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Phone number</FormLabel>
                  <Input
                    type="tel"
                    placeholder="+331234567890"
                    {...register('phoneNumber')}
                  />
                </FormControl>
              </>
            )}
          </Stack>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Subject</FormLabel>
              <Input placeholder="Hello!" {...register('subject')} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Your message</FormLabel>
              <Textarea
                placeholder="Tell us what you think"
                minH="19rem"
                {...register('message')}
              />
            </FormControl>
            <Button
              type="submit"
              leftIcon={<FiSend />}
              colorScheme="green"
              isLoading={isSubmitting}
            >
              Submit
            </Button>
          </Stack>
        </SimpleGrid>
      </form>
    </>
  )
}

export default ContactFormPage

// --

function usePublicKeyInURLHash() {
  const [publicKey, setPublicKey] = React.useState<Uint8Array | null>(null)
  React.useEffect(() => {
    const onHashChange = () => {
      const publicKey = base64UrlDecode(window.location.hash.replace(/^#/, ''))
      if (publicKey.byteLength === 32) {
        setPublicKey(publicKey)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return publicKey
}

// --

const SUBMIT_CONTACT_FORM_MUTATION = gql`
  mutation SubmitContactForm(
    $submissionBucketId: String!
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
