import {
  Box,
  BoxProps,
  Flex,
  Grid,
  Heading,
  Icon,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import {
  useE2ESDKClient,
  useE2ESDKClientIdentity,
} from '@socialgouv/e2esdk-react'
import React from 'react'
import { FiKey, FiTablet, FiUser } from 'react-icons/fi'
import { MdOutlineLock } from 'react-icons/md'
import { usePortalRef } from './components/PortalProvider'
import { SodiumState } from './components/SodiumState'
import { useLocalState } from './hooks/useLocalState'
import { AuthTab } from './tabs/AuthTab'
import { DevicesTab } from './tabs/DevicesTab'
import { IdentityTab } from './tabs/IdentityTab'
import { KeysTab } from './tabs/KeysTab'

export const E2ESdkDevtoolsView: React.FC<BoxProps> = ({ ...props }) => {
  const client = useE2ESDKClient()
  const identity = useE2ESDKClientIdentity()
  const [tabIndex, setTabIndex] = useLocalState({
    storageKey: 'e2esdk:devtools:tabIndex',
    defaultValue: 0,
  })
  return (
    <Box
      h="50vh"
      position="relative"
      borderTopWidth="1px"
      _light={{
        borderTopColor: 'gray.200',
        boxShadow: 'rgba(0, 0, 0, 0.025) 0px -6px 6px 0px',
      }}
      _dark={{
        borderTopColor: 'black',
        boxShadow: 'rgba(0, 0, 0, 0.15) 0px -12px 12px 0px',
      }}
      textAlign="start"
      {...props}
    >
      <Tabs
        index={identity ? tabIndex : 0}
        onChange={setTabIndex}
        position="absolute"
        inset={0}
        display="flex"
        flexDirection="column"
      >
        <Flex
          as="header"
          borderBottomWidth="1px"
          _light={{
            borderBottomColor: 'gray.200',
          }}
          _dark={{
            borderBottomColor: 'gray.700',
          }}
          alignItems="center"
          px={4}
          fontSize="lg"
        >
          <Icon as={MdOutlineLock} mr={2} />
          <Tooltip
            minWidth="lg"
            py={2}
            openDelay={500}
            label={
              <Grid
                templateColumns="8rem 1fr"
                alignItems="baseline"
                fontSize="xs"
              >
                <Text>Client ID</Text>
                <Text fontFamily="mono">{client.config.clientId}</Text>
                <Text>Server URL</Text>
                <Text fontFamily="mono">{client.config.serverURL}</Text>
                <Text>Server Public key</Text>
                <Text fontFamily="mono">
                  {client.encode(client.config.serverPublicKey)}
                </Text>
              </Grid>
            }
            portalProps={{
              containerRef: usePortalRef(),
            }}
          >
            <Heading
              as="h2"
              fontSize="lg"
              fontWeight="semibold"
              display={{ base: 'none', md: 'block' }}
            >
              e2esdk
            </Heading>
          </Tooltip>
          <TabList ml={{ base: 2, md: 8 }} mb="-1px">
            {identity ? (
              <>
                <Tab>
                  <Icon as={FiUser} mr={2} />
                  Identity
                </Tab>
                <Tab>
                  <Icon as={FiTablet} mr={2} />
                  Devices
                </Tab>
                <Tab>
                  <Icon as={FiKey} mr={2} />
                  Keys
                </Tab>
              </>
            ) : (
              <>
                <Tab>
                  <Icon as={FiUser} mr={2} />
                  Authenticate
                </Tab>
              </>
            )}
          </TabList>
          <SodiumState ml="auto" />
        </Flex>
        <Box pt={0} pb={4} overflow="auto" position="relative" flex={1}>
          {identity ? (
            <TabPanels>
              <TabPanel>
                <IdentityTab />
              </TabPanel>
              <TabPanel>
                <DevicesTab />
              </TabPanel>
              <TabPanel>
                <KeysTab />
              </TabPanel>
            </TabPanels>
          ) : (
            <TabPanels>
              <TabPanel>
                <AuthTab />
              </TabPanel>
            </TabPanels>
          )}
        </Box>
      </Tabs>
    </Box>
  )
}
