import { Badge, BadgeProps, Icon, Text } from '@chakra-ui/react'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'
import { FiCheckCircle, FiLoader } from 'react-icons/fi'

export const SodiumState: React.FC<BadgeProps> = props => {
  const client = useE2ESDKClient()
  const [isReady, setReady] = React.useState(false)
  React.useEffect(() => {
    client.sodium.ready.then(() => setReady(true))
  }, [setReady, client.sodium])
  return (
    <Badge
      h={5}
      colorScheme={isReady ? 'green' : 'orange'}
      textTransform="none"
      rounded="full"
      pr={{ base: undefined, md: 2 }}
      display="flex"
      alignItems="center"
      flexShrink={0}
      {...props}
    >
      <Icon
        as={isReady ? FiCheckCircle : FiLoader}
        mr={{ base: 0, md: 1 }}
        aria-label={`Sodium ${isReady ? 'ready' : 'loading'}`}
      />
      <Text as="span" display={{ base: 'none', md: 'inline' }}>
        Sodium {isReady ? 'ready' : 'loading'}
      </Text>
    </Badge>
  )
}
