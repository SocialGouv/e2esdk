import {
  Badge,
  Box,
  BoxProps,
  Button,
  Flex,
  Stack,
  Text,
} from '@chakra-ui/react'
import {
  useE2ESDKClient,
  useE2ESDKClientIdentity,
} from '@socialgouv/e2esdk-react'
import { useQuery } from '@tanstack/react-query'
import React from 'react'
import { FiPlusSquare, FiTablet } from 'react-icons/fi'
import {
  Section,
  SectionContainer,
  SectionHeader,
} from '../components/Sections'

export const DevicesTab: React.FC = () => {
  return (
    <SectionContainer>
      <YourDevicesSection />
      <DeviceManagementSection />
    </SectionContainer>
  )
}

// --

const YourDevicesSection = (props: BoxProps) => {
  const client = useE2ESDKClient()
  const identity = useE2ESDKClientIdentity()
  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => client.getEnrolledDevices(),
    enabled: Boolean(identity),
  })
  if (!devices) {
    return null
  }
  return (
    <Section {...props}>
      <SectionHeader icon={FiTablet}>Your devices</SectionHeader>
      <Stack spacing={4} px={4}>
        {devices.map(device => (
          <Flex key={device.id} alignItems="baseline">
            <Box>
              <Text fontWeight="medium" fontSize="xs">
                {device.label ?? 'Unnamed device'}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="gray.500">
                {device.id}
                {client.currentDeviceId === device.id && (
                  <Badge
                    fontSize="2xs"
                    colorScheme="green"
                    ml={2}
                    fontFamily="body"
                  >
                    Current
                  </Badge>
                )}
              </Text>
            </Box>
            <Text ml="auto" fontSize="xs" color="gray.500">
              {device.sessions.length || 'no'} session
              {device.sessions.length > 1 ? 's' : ''}
            </Text>
          </Flex>
        ))}
      </Stack>
    </Section>
  )
}

// --

const DeviceManagementSection = (props: BoxProps) => {
  const [isLoading, setIsLoading] = React.useState(false)
  const [deviceQR, setDeviceQR] = React.useState<string | null>(null)
  const client = useE2ESDKClient()

  const onSubmit = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const deviceQR = await client.enrollNewDevice()
      setDeviceQR(deviceQR)
    } finally {
      setIsLoading(false)
    }
  }, [client])

  return (
    <Section {...props}>
      <SectionHeader icon={FiPlusSquare}>Enroll new device</SectionHeader>
      <Stack spacing={4} px={4}>
        {!deviceQR && (
          <Button onClick={onSubmit} isLoading={isLoading}>
            Enroll new device
          </Button>
        )}
        {deviceQR && (
          <>
            <Text>{deviceQR}</Text>
          </>
        )}
      </Stack>
    </Section>
  )
}
