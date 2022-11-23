import {
  Box,
  Button,
  Center,
  CloseButton,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  Icon,
  IconProps,
  Input,
  Select,
  Spinner,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react'
import type { KeychainItemMetadata } from '@e2esdk/client'
import {
  Cipher,
  generateSealedBoxCipher,
  generateSecretBoxCipher,
} from '@e2esdk/crypto'
import { useE2ESDKClient, useE2ESDKClientKeys } from '@e2esdk/react'
import React from 'react'
import {
  FiCheckCircle,
  FiInbox,
  FiPlusCircle,
  FiShuffle,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi'
import { useQuery } from 'react-query'
import { AlgorithmBadge, algorithmColors } from '../components/AlgorithmBadge'
import {
  Section,
  SectionContainer,
  SectionHeader,
} from '../components/Sections'
import { useLocalState } from '../hooks/useLocalState'

export const KeysTab: React.FC = () => {
  const allKeys = useE2ESDKClientKeys('nameFingerprint')
  const [selectedKeyFingerprint, setSelectedKeyFingerprint] = useLocalState<
    string | null
  >({
    storageKey: 'e2esdk:devtools:keys:selectedKeyFingerprint',
    defaultValue: null,
  })
  const [showCreateKeyPanel, setShowCreateKeyPanel] = React.useState(false)

  // Hide key creation panel when selecting a key
  React.useEffect(() => {
    if (selectedKeyFingerprint) {
      setShowCreateKeyPanel(false)
    }
  }, [selectedKeyFingerprint])
  React.useEffect(() => {
    if (showCreateKeyPanel) {
      setSelectedKeyFingerprint(null)
    }
  }, [showCreateKeyPanel])

  const selectedKeys = selectedKeyFingerprint
    ? allKeys[selectedKeyFingerprint]
    : null
  return (
    <SectionContainer>
      <KeySelectorPanel
        allKeys={allKeys}
        selectedKeyFingerprint={selectedKeyFingerprint}
        setSelectedKeyFingerprint={setSelectedKeyFingerprint}
        onCreateKey={() => setShowCreateKeyPanel(true)}
      />
      <Section>
        {showCreateKeyPanel ? (
          <CreateKeyPanel
            onClose={() => setShowCreateKeyPanel(false)}
            onKeyCreated={setSelectedKeyFingerprint}
          />
        ) : selectedKeys ? (
          <KeyDetailsPanel keys={selectedKeys} />
        ) : (
          <Center h="100%" color="gray.500" fontSize="sm">
            Select a key to show its properties
          </Center>
        )}
      </Section>
    </SectionContainer>
  )
}

// --

type KeySelectorPanelProps = {
  allKeys: Record<string, KeychainItemMetadata[]>
  selectedKeyFingerprint: string | null
  setSelectedKeyFingerprint: (selected: string | null) => void
  onCreateKey: () => void
}

const KeySelectorPanel: React.FC<KeySelectorPanelProps> = ({
  allKeys,
  selectedKeyFingerprint,
  setSelectedKeyFingerprint,
  onCreateKey,
}) => {
  return (
    <Section display="flex" flexDirection="column">
      <SectionHeader mb={0} display="flex" alignItems="center">
        Your keys
        <Button
          ml="auto"
          size="xs"
          my={-2}
          variant="ghost"
          rounded="full"
          colorScheme="green"
          mr={-3}
          leftIcon={<FiPlusCircle />}
          onClick={onCreateKey}
        >
          Create new key
        </Button>
      </SectionHeader>
      <Stack spacing={0} flex={1}>
        {Object.entries(allKeys).map(([nameFingerprint, keys]) => (
          <Flex
            px={4}
            py={2}
            cursor="pointer"
            borderBottomWidth="1px"
            _light={{
              borderBottomColor: 'gray.100',
              background:
                selectedKeyFingerprint === nameFingerprint
                  ? 'gray.10'
                  : 'transparent',
            }}
            _dark={{
              borderBottomColor: 'gray.800',
              background:
                selectedKeyFingerprint === nameFingerprint
                  ? 'gray.1000'
                  : 'transparent',
            }}
            key={nameFingerprint + keys[0]?.createdAt.toISOString()}
            borderLeftWidth="3px"
            borderLeftColor={
              selectedKeyFingerprint === nameFingerprint
                ? `${algorithmColors[keys[0].algorithm]}.500`
                : 'transparent'
            }
            gap={4}
            alignItems="center"
            onClick={() =>
              setSelectedKeyFingerprint(
                nameFingerprint === selectedKeyFingerprint
                  ? null
                  : nameFingerprint
              )
            }
          >
            <Icon
              color="gray.500"
              as={
                keys[0].algorithm === 'secretBox'
                  ? FiUsers
                  : keys[0].algorithm === 'sealedBox'
                  ? FiInbox
                  : FiShuffle
              }
              title={keys[0].algorithm}
              aria-label={keys[0].algorithm}
            />
            <Box flex={1}>
              <Text fontFamily="mono" fontSize="sm">
                {keys[0].name}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="gray.500">
                {keys[0].nameFingerprint}
              </Text>
            </Box>
          </Flex>
        ))}
        {Object.keys(allKeys).length === 0 && (
          <Center h="100%" as={Stack} py={4} spacing={4}>
            <Text fontSize="sm" color="gray.500">
              Your keychain is empty
            </Text>
          </Center>
        )}
      </Stack>
    </Section>
  )
}

// --

type CreateKeyPanelProps = {
  onClose: () => void
  onKeyCreated: (fingerprint: string) => void
}

const CreateKeyPanel: React.FC<CreateKeyPanelProps> = ({
  onClose,
  onKeyCreated,
}) => {
  const client = useE2ESDKClient()
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<Cipher['algorithm']>('secretBox')
  const createKey = React.useCallback(async () => {
    const cipher =
      type === 'secretBox'
        ? generateSecretBoxCipher(client.sodium)
        : generateSealedBoxCipher(client.sodium)

    const key = await client.addKey({
      name,
      cipher,
    })
    setName('')
    onKeyCreated(key.nameFingerprint)
  }, [client, name, type, onKeyCreated])
  return (
    <>
      <SectionHeader mt={0} display="flex" alignItems="center">
        <Icon as={FiPlusCircle} mr={2} ml="2px" />
        Create key
        <CloseButton
          marginLeft="auto"
          variant="ghost"
          rounded="full"
          my={-2}
          size="sm"
          onClick={onClose}
        />
      </SectionHeader>
      <Stack spacing={4} px={4}>
        <FormControl>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={e => setName(e.target.value)} />
          <FormHelperText>What will the key be used for?</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel>Type</FormLabel>
          <Select
            value={type}
            onChange={e => setType(e.target.value as Cipher['algorithm'])}
          >
            <option value={'secretBox'}>Secret Box</option>
            <option value={'sealedBox'}>Sealed Box</option>
          </Select>
          <FormHelperText>
            {type === 'secretBox' && (
              <>Encrypt & decrypt using a secret key, for shared workspaces</>
            )}
            {type === 'sealedBox' && (
              <>Collect anonymous data from outsiders using a public key</>
            )}
          </FormHelperText>
        </FormControl>
        <Button onClick={createKey} colorScheme={algorithmColors[type]}>
          Create {type === 'secretBox' ? 'secret key' : 'key pair'}
        </Button>
      </Stack>
    </>
  )
}

// --

type KeyDetailsPanelProps = {
  keys: KeychainItemMetadata[]
}

const KeyDetailsPanel: React.FC<KeyDetailsPanelProps> = ({ keys }) => {
  const client = useE2ESDKClient()
  const currentKey = keys[0]
  const { data: permissions } = useQuery({
    queryKey: ['key', currentKey?.nameFingerprint, 'permissions'] as const,
    queryFn: ({ queryKey }) => client.getPermissions(queryKey[1]),
    enabled: Boolean(currentKey),
  })
  if (!currentKey) {
    return (
      <Center h="100%" color="gray.500" fontSize="sm">
        Key set is empty
      </Center>
    )
  }

  return (
    <>
      <SectionHeader>Metadata</SectionHeader>
      <Grid
        templateColumns="8rem 1fr"
        px={4}
        rowGap={2}
        fontSize="sm"
        alignItems="center"
      >
        <Text fontWeight="semibold">Algorithm</Text>
        <AlgorithmBadge algorithm={currentKey.algorithm} />
        <Text fontWeight="semibold">Fingerprint</Text>
        <Text fontFamily="mono" color="gray.500">
          {currentKey.payloadFingerprint}
        </Text>
        {currentKey.publicKey && (
          <>
            <Text fontWeight="semibold">Public key</Text>
            <Text fontFamily="mono" color="gray.500">
              {currentKey.publicKey}
            </Text>
          </>
        )}
        <Text fontWeight="semibold">Created</Text>
        <Text fontFamily="mono" color="gray.500">
          {currentKey.createdAt.toLocaleString(['se-SE'])}
        </Text>
        <Text fontWeight="semibold">Expires</Text>
        <Text fontFamily="mono" color="gray.500">
          {currentKey.expiresAt?.toLocaleString(['se-SE']) ?? <em>never</em>}
        </Text>
        <Text fontWeight="semibold">Shared from</Text>
        <Text fontFamily="mono" color="gray.500">
          {currentKey.sharedBy ?? <em>null</em>}
        </Text>
      </Grid>
      <SectionHeader mt={8}>Permissions</SectionHeader>
      <Grid
        templateColumns="8rem 1fr"
        px={4}
        rowGap={2}
        fontSize="sm"
        alignItems="center"
      >
        <Text fontWeight="semibold">Share</Text>
        <PermissionIcon allowed={permissions?.allowSharing} />
        <Text fontWeight="semibold">Rotate</Text>
        <PermissionIcon allowed={permissions?.allowRotation} />
        <Text fontWeight="semibold">Delete</Text>
        <PermissionIcon allowed={permissions?.allowDeletion} />
        <Text fontWeight="semibold">Manage</Text>
        <PermissionIcon allowed={permissions?.allowManagement} />
      </Grid>
      {keys.length > 1 && (
        <>
          <SectionHeader>Previous Keys</SectionHeader>
          <TableContainer>
            <Table size="sm" mt={-2}>
              <Thead>
                <Tr>
                  <Th>Fingerprint</Th>
                  {currentKey.publicKey && <Th>Public Key</Th>}
                  <Th>Created</Th>
                  <Th>Expires</Th>
                  <Th>Shared from</Th>
                </Tr>
              </Thead>
              <Tbody
                color="gray.500"
                fontSize="xs"
                sx={{
                  '& td': {
                    fontSize: 'xs',
                  },
                }}
              >
                {keys.slice(1).map(key => (
                  <Tr key={key.createdAt.toISOString()} fontFamily="mono">
                    <Td>{key.payloadFingerprint}</Td>
                    {key.publicKey && <Td>{key.publicKey}</Td>}
                    <Td>{key.createdAt.toLocaleString(['se-SE'])}</Td>
                    <Td>
                      {key.expiresAt?.toLocaleString(['se-SE']) ?? (
                        <em>never</em>
                      )}
                    </Td>
                    <Td>{key.sharedBy ?? <em>null</em>}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  )
}

// --

type PermissionIconProps = IconProps & {
  allowed: boolean | undefined
}

const PermissionIcon: React.FC<PermissionIconProps> = ({
  allowed,
  ...props
}) => (
  <Icon
    as={allowed === undefined ? Spinner : allowed ? FiCheckCircle : FiXCircle}
    color={
      allowed === undefined ? undefined : allowed ? 'green.600' : 'red.600'
    }
    _dark={{
      color:
        allowed === undefined ? undefined : allowed ? 'green.400' : 'red.400',
    }}
    strokeWidth={2.5}
    transform="translateY(1.5px)"
    {...props}
  />
)
