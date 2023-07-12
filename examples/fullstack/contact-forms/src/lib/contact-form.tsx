import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Icon,
  Image,
  ImageProps,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useMultiStyleConfig,
  useToast,
} from '@chakra-ui/react'
import {
  decryptFormForEdition,
  encryptFile,
  encryptFormData,
  fileMetadataSchema,
  initializeEncryptedFormLocalState,
  isEncryptedFormLocalStatePersisted,
  persistEncryptedFormLocalState,
} from '@socialgouv/e2esdk-crypto'
import request, { gql } from 'graphql-request'
import Link from 'next/link'
import prettyBytes from 'pretty-bytes'
import React from 'react'
import { useForm } from 'react-hook-form'
import { FiSend, FiX } from 'react-icons/fi'
import { z } from 'zod'
import { downloadAndDecryptFile, uploadFiles } from './files'

const formSchema = z.object({
  subject: z.string(),
  message: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().optional(),
  contactMe: z.boolean(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  proofOfIdentity: z.array(z.instanceof(File)).optional(),
  identityPhoto: z.array(z.instanceof(File)).optional(),
})

type FormValues = z.infer<typeof formSchema>
type SubmitContactFormVariables = {
  submissionBucketId: string
  signature: string
  sealedSecret: string
  publicKey: string
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

type UpdateResponseData = {
  updated: null | {
    id: string
  }
}

const LAST_SUBMISSION_ID_STORAGE_KEY = 'e2esdk:contact-forms:lastSubmissionId'

// --

export type ContactFormProps = {
  submissionBucketId: string
  publicKey: Uint8Array
  editLink?: string
}

export const ContactForm: React.FC<ContactFormProps> = ({
  submissionBucketId,
  publicKey,
  editLink,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
    reset: resetForm,
  } = useForm<FormValues>()

  const currentlyEditedSubmissionId = useEdition(
    submissionBucketId,
    publicKey,
    resetForm
  )

  const inputFileStyles = {
    '::file-selector-button': {
      border: 'none',
      outline: 'none',
      ...useMultiStyleConfig('Button', {
        size: 'sm',
      }),
      mr: 2,
      ml: '-13px',
      mt: '3px',
    },
  }

  const toast = useToast({
    position: 'bottom-right',
  })
  const onSubmit = React.useCallback(
    async (values: FormValues) => {
      if (!publicKey || !submissionBucketId) {
        return
      }
      const state = await initializeEncryptedFormLocalState(submissionBucketId)
      const formData = new FormData()
      if (values.proofOfIdentity?.length === 1) {
        const file = values.proofOfIdentity[0]
        const { encryptedFile, metadata } = await encryptFile(
          state.sodium,
          file
        )
        formData.set('proofOfIdentity', encryptedFile)
        // @ts-ignore
        values.proofOfIdentity = metadata
      } else {
        delete values.proofOfIdentity
      }
      if (values.identityPhoto?.length === 1) {
        const file = values.identityPhoto[0]
        const { encryptedFile, metadata } = await encryptFile(
          state.sodium,
          file
        )
        formData.set('identityPhoto', encryptedFile)
        // @ts-ignore
        values.identityPhoto = metadata
      } else {
        delete values.identityPhoto
      }
      await uploadFiles(formData)

      if (Number.isNaN(values.age)) {
        delete values.age
      }

      // Then encrypt the rest of the fields
      const { metadata, encrypted } = encryptFormData(values, state)

      const variables: SubmitContactFormVariables = {
        submissionBucketId,
        sealedSecret: metadata.sealedSecret,
        signature: metadata.signature,
        publicKey: metadata.publicKey,
        ...encrypted,
      }
      if (currentlyEditedSubmissionId === null) {
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
          persistEncryptedFormLocalState(state, submissionBucketId)
          window.localStorage.setItem(
            LAST_SUBMISSION_ID_STORAGE_KEY,
            res.inserted.id
          )
        }
      } else {
        // @ts-ignore
        delete variables.submissionBucketId
        const res = await request<UpdateResponseData>(
          'http://localhost:4002/v1/graphql', // todo: Use env
          EDIT_CONTACT_FORM_MUTATION,
          {
            ...variables,
            id: currentlyEditedSubmissionId,
          }
        )
        if (res.updated?.id) {
          toast({
            status: 'success',
            title: 'Thanks!',
            description: <>Your message has been updated.</>,
          })
        } else {
          console.dir(res)
        }
      }
    },
    [publicKey, submissionBucketId, toast, currentlyEditedSubmissionId]
  )
  const proofOfIdentity = watch('proofOfIdentity')?.[0]
  const identityPhoto = watch('identityPhoto')?.[0]

  return (
    <>
      <Heading as="h1">Contact us</Heading>
      <Text fontSize="sm" color="gray.600" _dark={{ color: 'gray.400' }} mt={1}>
        All provided data is end-to-end encrypted.
      </Text>
      {editLink && currentlyEditedSubmissionId !== null && (
        <Link href={editLink}>Edit last submission</Link>
      )}
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
            <FormControl>
              <FormLabel>Proof of identity</FormLabel>
              <Input
                type="file"
                accept=".pdf"
                sx={inputFileStyles}
                {...register('proofOfIdentity')}
              />
              <FormHelperText display="flex" alignItems="center" gap={2}>
                {proofOfIdentity ? (
                  <>
                    <Button
                      onClick={() => setValue('proofOfIdentity', undefined)}
                      size="xs"
                      leftIcon={
                        <Icon
                          as={FiX}
                          transform="translateY(0.75px)"
                          mr={-0.5}
                        />
                      }
                      colorScheme="red"
                      variant="ghost"
                    >
                      Remove proof of identity
                    </Button>
                    {prettyBytes(proofOfIdentity.size)}
                  </>
                ) : (
                  <>
                    PDF scan of your identity card, passport or driving license
                  </>
                )}
              </FormHelperText>
            </FormControl>
            <FormControl>
              <FormLabel>Identity photo</FormLabel>
              <Input
                type="file"
                accept="image/*"
                sx={inputFileStyles}
                {...register('identityPhoto')}
              />
              <FormHelperText>
                {identityPhoto ? (
                  <>
                    <Flex alignItems="center" gap={2} mb={2}>
                      <Button
                        onClick={() => setValue('identityPhoto', undefined)}
                        size="xs"
                        leftIcon={
                          <Icon
                            as={FiX}
                            transform="translateY(0.75px)"
                            mr={-0.5}
                          />
                        }
                        colorScheme="red"
                        variant="ghost"
                      >
                        Remove ID photo
                      </Button>
                      {prettyBytes(identityPhoto.size)}
                    </Flex>
                    <ImagePreview file={identityPhoto} />
                  </>
                ) : (
                  <>PNG or JPG image, 10MB maximum</>
                )}
              </FormHelperText>
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

// --

const ImagePreview: React.FC<{ file: File } & ImageProps> = ({
  file,
  ...props
}) => {
  const [src, setSrc] = React.useState<string | undefined>()
  React.useEffect(() => {
    const objectURL = URL.createObjectURL(file)
    setSrc(objectURL)
    return () => URL.revokeObjectURL(objectURL)
  }, [file])
  return (
    <Image
      alt="Preview"
      src={src}
      fit="contain"
      boxSize={48}
      rounded="md"
      fallback={<Box bg="gray.500" {...props} />}
      {...props}
    />
  )
}

// --

const SUBMIT_CONTACT_FORM_MUTATION = gql`
  mutation SubmitContactForm(
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
    $proofOfIdentity: String
    $identityPhoto: String
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
        proofOfIdentity: $proofOfIdentity
        identityPhoto: $identityPhoto
      }
    ) {
      id
    }
  }
`

const EDIT_CONTACT_FORM_MUTATION = gql`
  mutation EditContactForm(
    $id: Int!
    # Metadata
    $signature: String!
    $sealedSecret: String!
    $publicKey: String!
    # Encrypted fields
    $subject: String
    $message: String
    $firstName: String
    $lastName: String
    $age: String
    $contactMe: String
    $email: String
    $phoneNumber: String
    $proofOfIdentity: String
    $identityPhoto: String
  ) {
    updated: update_contactFormSubmissions_by_pk(
      pk_columns: { id: $id }
      _set: {
        # Updated metadata
        signature: $signature
        # Note that the sealed secret itself doesn't change,
        # but is re-encrypted for every submission, so its
        # ciphertext changes, which is computed in the signature.
        sealedSecret: $sealedSecret
        publicKey: $publicKey
        # Updated encrypted fields
        subject: $subject
        message: $message
        firstName: $firstName
        lastName: $lastName
        age: $age
        contactMe: $contactMe
        email: $email
        phoneNumber: $phoneNumber
        proofOfIdentity: $proofOfIdentity
        identityPhoto: $identityPhoto
      }
    ) {
      id
    }
  }
`

// --

function useEdition(
  submissionBucketId: string,
  formPublicKey: Uint8Array,
  onLoaded: (values: FormValues) => void
) {
  const [submissionId, setSubmissionId] = React.useState<number | null>(null)
  React.useEffect(() => {
    // First, check if there is a valid persisted state
    // (last submission ID + cryptographic state)
    const submissionId = parseInt(
      window.localStorage.getItem(LAST_SUBMISSION_ID_STORAGE_KEY) ?? ''
    )
    if (
      !isEncryptedFormLocalStatePersisted(submissionBucketId) ||
      !submissionId
    ) {
      return
    }
    loadFormState(submissionId, submissionBucketId, formPublicKey)
      .then(onLoaded)
      .then(() => setSubmissionId(submissionId))
      .catch(console.error)
  }, [submissionBucketId, formPublicKey, onLoaded])
  return submissionId
}

async function loadFormState(
  submissionId: number,
  submissionBucketId: string,
  formPublicKey: Uint8Array
): Promise<FormValues> {
  const state = await initializeEncryptedFormLocalState(
    submissionBucketId,
    formPublicKey
  )
  const { submission } = await request<{
    submission: SubmitContactFormVariables
  }>(
    'http://localhost:4002/v1/graphql', // todo: Use env
    GET_CONTACT_FORM_SUBMISSION,
    {
      id: submissionId,
    }
  )
  const { publicKey, sealedSecret, signature, ...encrypted } = submission
  const decrypted = decryptFormForEdition(
    {
      metadata: {
        publicKey,
        sealedSecret,
        signature,
      },
      encrypted,
    },
    state
  )
  // Re-hydrate files before parsing
  const identityPhoto = fileMetadataSchema.safeParse(decrypted.identityPhoto)
  if (identityPhoto.success) {
    decrypted.identityPhoto = [
      await downloadAndDecryptFile(state.sodium, identityPhoto.data),
    ]
  }
  const proofOfIdentity = fileMetadataSchema.safeParse(
    decrypted.proofOfIdentity
  )
  if (proofOfIdentity.success) {
    decrypted.proofOfIdentity = [
      await downloadAndDecryptFile(state.sodium, proofOfIdentity.data),
    ]
  }
  return formSchema.parse(decrypted)
}

const GET_CONTACT_FORM_SUBMISSION = gql`
  query ContactFormSubmission($id: Int!) {
    submission: contactFormSubmissions_by_pk(id: $id) {
      # Metadata
      signature
      sealedSecret
      publicKey
      # Encrypted fields
      subject
      message
      firstName
      lastName
      age
      contactMe
      email
      phoneNumber
      proofOfIdentity
      identityPhoto
    }
  }
`
