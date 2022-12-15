import {
  Container,
  Flex,
  FlexProps,
  Icon,
  IconButton,
  Link,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Stack,
  Text,
} from '@chakra-ui/react'
import {
  useE2ESDKClient,
  useE2ESDKClientIdentity,
} from '@socialgouv/e2esdk-react'
import { ColorModeSwitch } from 'components/colorModeSwitch'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import {
  FiLock,
  FiLogOut,
  FiPenTool,
  FiPlusCircle,
  FiShield,
  FiUser,
} from 'react-icons/fi'
import { MdOutlineLock } from 'react-icons/md'
import { NoSSR } from './NoSSR'

type PageLayoutProps = FlexProps & {
  children: React.ReactNode
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  ...props
}) => {
  const client = useE2ESDKClient()
  const identity = useE2ESDKClientIdentity()
  const router = useRouter()
  if (router.asPath.startsWith('/contact-form')) {
    return (
      <>
        <Flex
          as="header"
          py={2}
          px={4}
          gap={2}
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          rowGap={2}
        >
          <Text fontWeight="semibold">
            <Icon as={MdOutlineLock} mr={1} transform="translateY(2px)" />
            e2e SDK Demo
          </Text>
          <ColorModeSwitch />
        </Flex>
        <Container maxW="5xl" my={8}>
          {children}
        </Container>
      </>
    )
  }

  const containerWidth =
    router.asPath.startsWith('/app/contact-forms/') &&
    !router.asPath.endsWith('/new')
      ? '8xl'
      : '2xl'

  return (
    <>
      <Flex
        py={2}
        px={4}
        gap={2}
        alignItems="center"
        flexWrap="wrap"
        rowGap={2}
        {...props}
      >
        <Link as={NextLink} href="/app/contact-forms" passHref>
          <Text fontWeight="semibold">
            <Icon as={MdOutlineLock} mr={1} transform="translateY(2px)" />
            e2e SDK Demo
          </Text>
        </Link>
        <Stack
          as="nav"
          isInline
          spacing={8}
          ml={8}
          fontWeight="semibold"
          fontSize="small"
        >
          <>
            <Link
              as={NextLink}
              href="/app/contact-forms/new"
              passHref
              textDecoration={
                router.asPath === '/app/contact-forms/new'
                  ? 'underline'
                  : undefined
              }
            >
              <Icon as={FiPlusCircle} mr={1.5} transform="translateY(2px)" />
              New form
            </Link>
          </>
        </Stack>
        <Stack isInline marginLeft="auto" alignItems="center">
          <ColorModeSwitch />
          <Menu>
            <MenuButton
              as={IconButton}
              icon={<FiUser />}
              rounded="full"
              variant="ghost"
              aria-label="User settings"
            />
            <MenuList>
              <NoSSR>
                {identity ? (
                  <>
                    <MenuItem icon={<FiUser />}>
                      <Text as="span" fontFamily="mono" fontSize="xs">
                        {identity.userId}
                      </Text>
                    </MenuItem>
                    <MenuItem icon={<FiLock />}>
                      <Text as="span" fontFamily="mono" fontSize="xs">
                        {identity.sharingPublicKey}
                      </Text>
                    </MenuItem>
                    <MenuItem icon={<FiPenTool />}>
                      <Text as="span" fontFamily="mono" fontSize="xs">
                        {identity.signaturePublicKey}
                      </Text>
                    </MenuItem>
                    <MenuItem icon={<FiShield />}>
                      <Text as="span" fontFamily="mono" fontSize="xs">
                        {identity.proof.slice(0, 43)}
                        <br />
                        {identity.proof.slice(43)}
                      </Text>
                    </MenuItem>
                    <MenuItem
                      icon={<FiLogOut />}
                      color="red.500"
                      onClick={() => {
                        client.logout()
                        router.push('/login')
                      }}
                    >
                      Log out
                    </MenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem
                      as={NextLink}
                      display="block"
                      href="/login"
                      passHref
                    >
                      Log in
                    </MenuItem>
                    <MenuItem
                      as={NextLink}
                      display="block"
                      href="/signup"
                      passHref
                    >
                      Sign up
                    </MenuItem>
                  </>
                )}
              </NoSSR>
            </MenuList>
          </Menu>
        </Stack>
      </Flex>
      <Container maxW={containerWidth} my={8}>
        {children}
      </Container>
    </>
  )
}
