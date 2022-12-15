import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  StackProps,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'
import { useForm } from 'react-hook-form'
import { FiLogIn, FiPlusCircle } from 'react-icons/fi'
import { z } from 'zod'

type AuthFormProps = Omit<StackProps, 'onSubmit'> & {
  onSubmit: (formValues: FormValues) => Promise<any> | void
  buttonText: string
  buttonIcon: React.ReactElement
}

const formSchema = z.object({
  userId: z.string(),
  mainKey: z.string(),
})

type FormValues = z.infer<typeof formSchema>

const AuthForm: React.FC<AuthFormProps> = ({
  onSubmit,
  buttonText,
  buttonIcon,
  ...props
}) => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = useForm<FormValues>()
  const _onSubmit = React.useCallback(
    async (values: FormValues) => {
      await onSubmit(values)
      reset()
    },
    [onSubmit, reset]
  )
  return (
    <Box as="form" onSubmit={handleSubmit(_onSubmit)} px={5}>
      <Stack spacing={4} {...props}>
        <FormControl>
          <FormLabel>User ID</FormLabel>
          <Input fontFamily="mono" {...register('userId')} />
        </FormControl>
        <FormControl>
          <FormLabel>Main Key</FormLabel>
          <Input fontFamily="mono" {...register('mainKey')} />
        </FormControl>
        <Button type="submit" isLoading={isSubmitting} leftIcon={buttonIcon}>
          {buttonText}
        </Button>
      </Stack>
    </Box>
  )
}

// --

export const LoginForm: React.FC<Omit<StackProps, 'onSubmit'>> = props => {
  const client = useE2ESDKClient()
  const login = React.useCallback(
    async (values: FormValues) => {
      const mainKey = client.decode(values.mainKey)
      await client.login(values.userId, mainKey)
      client.sodium.memzero(mainKey)
    },
    [client]
  )
  return (
    <AuthForm
      onSubmit={login}
      buttonText="Log in"
      buttonIcon={<FiLogIn />}
      {...props}
    />
  )
}

// --

export const SignupForm: React.FC<Omit<StackProps, 'onSubmit'>> = props => {
  const client = useE2ESDKClient()
  const signup = React.useCallback(
    async (values: FormValues) => {
      const mainKey = client.decode(values.mainKey)
      await client.signup(values.userId, mainKey)
      client.sodium.memzero(mainKey)
    },
    [client]
  )
  return (
    <AuthForm
      onSubmit={signup}
      buttonText="Sign up"
      buttonIcon={<FiPlusCircle />}
      {...props}
    />
  )
}
