import {
  Box,
  BoxProps,
  Flex,
  Heading,
  Icon,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react'
import { useE2ESDKClientIdentity } from '@e2esdk/react'
import React from 'react'
import { FiKey, FiLogIn, FiPlusCircle, FiUser } from 'react-icons/fi'
import { MdOutlineLock } from 'react-icons/md'
import { LoginForm, SignupForm } from './components/AuthForm'
import { SodiumState } from './components/SodiumState'
import { useLocalState } from './hooks/useLocalState'
import { IdentityTab } from './tabs/IdentityTab'
import { KeysTab } from './tabs/KeysTab'

export const E2ESdkDevtoolsView: React.FC<BoxProps> = ({ ...props }) => {
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
      {...props}
    >
      <Tabs
        index={tabIndex}
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
          <Heading
            as="h2"
            fontSize="lg"
            fontWeight="semibold"
            display={{ base: 'none', md: 'block' }}
          >
            e2e SDK
          </Heading>
          <TabList ml={{ base: 2, md: 8 }} mb="-1px">
            {identity ? (
              <>
                <Tab>
                  <Icon as={FiUser} mr={2} />
                  Identity
                </Tab>
                <Tab>
                  <Icon as={FiKey} mr={2} />
                  Keys
                </Tab>
              </>
            ) : (
              <>
                <Tab>
                  <Icon as={FiLogIn} mr={2} />
                  Log in
                </Tab>
                <Tab>
                  <Icon as={FiPlusCircle} mr={2} /> Sign up
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
                <KeysTab />
              </TabPanel>
            </TabPanels>
          ) : (
            <TabPanels>
              <TabPanel px={0}>
                <LoginForm />
              </TabPanel>
              <TabPanel px={0}>
                <SignupForm />
              </TabPanel>
            </TabPanels>
          )}
        </Box>
      </Tabs>
    </Box>
  )
}
