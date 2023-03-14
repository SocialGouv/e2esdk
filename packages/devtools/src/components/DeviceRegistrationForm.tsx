import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  StackProps,
} from '@chakra-ui/react'
import { base64Bytes, identitySchema } from '@socialgouv/e2esdk-api'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'
import { useForm } from 'react-hook-form'
import { FiSave } from 'react-icons/fi'
import { z } from 'zod'

const formSchema = z.object({
  userId: identitySchema.shape.userId,
  deviceId: z.string().uuid(),
  deviceSecret: base64Bytes(32),
})

type FormValues = z.infer<typeof formSchema>

// --

export const DeviceRegistrationForm: React.FC<
  Omit<StackProps, 'onSubmit'>
> = props => {
  const client = useE2ESDKClient()
  const { register, handleSubmit, reset } = useForm<FormValues>()
  const onSubmit = React.useCallback(
    (values: FormValues) => {
      client.registerEnrolledDevice(
        values.userId,
        values.deviceId,
        values.deviceSecret
      )
      reset()
    },
    [client, reset]
  )
  return (
    <Box as="form" onSubmit={handleSubmit(onSubmit)} px={5}>
      <Stack spacing={4} {...props}>
        <FormControl>
          <FormLabel>User ID</FormLabel>
          <Input fontFamily="mono" {...register('userId')} />
        </FormControl>
        <FormControl>
          <FormLabel>Device ID</FormLabel>
          <Input fontFamily="mono" {...register('deviceId')} />
        </FormControl>
        <FormControl>
          <FormLabel>Device secret</FormLabel>
          <Input fontFamily="mono" {...register('deviceSecret')} />
        </FormControl>
        <Button type="submit" leftIcon={<FiSave />}>
          Register device
        </Button>
      </Stack>
    </Box>
  )
}
