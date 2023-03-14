import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  StackProps,
} from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'
import { useForm } from 'react-hook-form'
import { FiSave } from 'react-icons/fi'
import { z } from 'zod'

const formSchema = z.object({
  qr: z.string(),
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
      client.registerEnrolledDevice(values.qr)
      reset()
    },
    [client, reset]
  )
  return (
    <Box as="form" onSubmit={handleSubmit(onSubmit)} px={5}>
      <Stack spacing={4} {...props}>
        <FormControl>
          <FormLabel>Device registration URI</FormLabel>
          <Input fontFamily="mono" {...register('qr')} />
          <FormHelperText>// todo: Add QR code scanner</FormHelperText>
        </FormControl>
        <Button type="submit" leftIcon={<FiSave />}>
          Register device
        </Button>
      </Stack>
    </Box>
  )
}
