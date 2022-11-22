import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  StackProps,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@e2esdk/react'
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
  personalKey: z.string(),
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
  } = useForm<FormValues>()
  return (
    <Box as="form" onSubmit={handleSubmit(onSubmit)} px={5}>
      <Stack spacing={4} {...props}>
        <FormControl>
          <FormLabel>User ID</FormLabel>
          <Input fontFamily="mono" {...register('userId')} />
        </FormControl>
        <FormControl>
          <FormLabel>Personal Key</FormLabel>
          <Input fontFamily="mono" {...register('personalKey')} />
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
      await client.login(values.userId, client.decode(values.personalKey))
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
      await client.signup(values.userId, client.decode(values.personalKey))
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
