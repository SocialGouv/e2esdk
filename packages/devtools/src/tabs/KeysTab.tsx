import {
  Box,
  Button,
  ButtonProps,
  Center,
  Checkbox,
  CloseButton,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Icon,
  IconButton,
  IconButtonProps,
  IconProps,
  Input,
  InputGroup,
  InputRightElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Portal,
  Select,
  Spinner,
  Stack,
  StackProps,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useDisclosure,
} from '@chakra-ui/react'
import {
  Client,
  KeychainItemMetadata,
  PublicUserIdentity,
} from '@socialgouv/e2esdk-client'
import {
  useE2ESDKClient,
  useE2ESDKClientIdentity,
  useE2ESDKClientKeys,
} from '@socialgouv/e2esdk-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import FocusLock from 'react-focus-lock'
import { IconType } from 'react-icons'
import {
  FiArchive,
  FiClock,
  FiInbox,
  FiKey,
  FiPlusCircle,
  FiRefreshCw,
  FiRotateCw,
  FiShare2,
  FiShuffle,
  FiSliders,
  FiTrash2,
  FiUserMinus,
  FiUsers,
} from 'react-icons/fi'
import { AlgorithmBadge, algorithmColors } from '../components/AlgorithmBadge'
import { usePortalRef } from '../components/PortalProvider'
import {
  Section,
  SectionContainer,
  SectionHeader,
} from '../components/Sections'
import { UserIdentityInput } from '../components/UserIdentityInput'
import { useLocalState } from '../hooks/useLocalState'

export const KeysTab: React.FC = () => {
  const allKeys = useE2ESDKClientKeys()
  const [selectedKeychainFingerprint, setSelectedKeychainFingerprint] =
    useLocalState<string | null>({
      storageKey: 'e2esdk:devtools:keys:selectedKeychainFingerprint',
      defaultValue: null,
    })
  const [showCreateKeyPanel, setShowCreateKeyPanel] = React.useState(false)

  // Hide key creation panel when selecting a key
  React.useEffect(() => {
    if (selectedKeychainFingerprint) {
      setShowCreateKeyPanel(false)
    }
  }, [selectedKeychainFingerprint])
  React.useEffect(() => {
    if (showCreateKeyPanel) {
      setSelectedKeychainFingerprint(null)
    }
  }, [showCreateKeyPanel])

  const selectedKeys = selectedKeychainFingerprint
    ? allKeys[selectedKeychainFingerprint]
    : null
  return (
    <SectionContainer>
      <KeySelectorPanel
        allKeys={allKeys}
        selectedKeychainFingerprint={selectedKeychainFingerprint}
        setSelectedKeychainFingerprint={setSelectedKeychainFingerprint}
        onCreateKey={() => setShowCreateKeyPanel(true)}
      />
      <Section flex={1.5}>
        {showCreateKeyPanel ? (
          <CreateKeyPanel
            onClose={() => setShowCreateKeyPanel(false)}
            onKeyCreated={setSelectedKeychainFingerprint}
          />
        ) : selectedKeys ? (
          <KeyDetailsPanel keys={selectedKeys} />
        ) : (
          <Center h="100%" color="gray.500" fontSize="xs">
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
  selectedKeychainFingerprint: string | null
  setSelectedKeychainFingerprint: (selected: string | null) => void
  onCreateKey: () => void
}

const KeySelectorPanel: React.FC<KeySelectorPanelProps> = ({
  allKeys,
  selectedKeychainFingerprint,
  setSelectedKeychainFingerprint,
  onCreateKey,
}) => {
  return (
    <Section display="flex" flexDirection="column">
      <SectionHeader mb={0} display="flex" alignItems="center">
        Your keychains
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
          Create new keychain
        </Button>
      </SectionHeader>
      <Stack spacing={0} flex={1}>
        {Object.entries(allKeys).map(([keychainFingerprint, keys]) => (
          <Flex
            px={4}
            py={2}
            cursor="pointer"
            borderBottomWidth="1px"
            _light={{
              borderBottomColor: 'gray.100',
              background:
                selectedKeychainFingerprint === keychainFingerprint
                  ? 'gray.10'
                  : 'transparent',
            }}
            _dark={{
              borderBottomColor: 'gray.800',
              background:
                selectedKeychainFingerprint === keychainFingerprint
                  ? 'gray.1000'
                  : 'transparent',
            }}
            key={keychainFingerprint + keys[0]?.createdAt.toISOString()}
            borderLeftWidth="3px"
            borderLeftColor={
              selectedKeychainFingerprint === keychainFingerprint
                ? `${algorithmColors[keys[0].algorithm]}.500`
                : 'transparent'
            }
            gap={4}
            alignItems="center"
            onClick={() =>
              setSelectedKeychainFingerprint(
                keychainFingerprint === selectedKeychainFingerprint
                  ? null
                  : keychainFingerprint
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
              <Text fontFamily="mono" fontSize="xs">
                {keys[0].purpose}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="gray.500">
                {keys[0].keychainFingerprint}
              </Text>
            </Box>
          </Flex>
        ))}
        {Object.keys(allKeys).length === 0 && (
          <Center h="100%" as={Stack} py={4} spacing={4}>
            <Text fontSize="xs" color="gray.500">
              No keychains yet
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
  type CipherAlgorithm = 'secretBox' | 'sealedBox'
  const client = useE2ESDKClient()
  const [purpose, setPurpose] = React.useState('')
  const [type, setType] = React.useState<CipherAlgorithm>('secretBox')
  const createKey = React.useCallback(async () => {
    const key = await client.createNewKeychain(purpose, type)
    setPurpose('')
    onKeyCreated(key.keychainFingerprint)
  }, [client, purpose, type, onKeyCreated])
  return (
    <>
      <SectionHeader mt={0} display="flex" alignItems="center">
        <Icon as={FiPlusCircle} mr={2} ml="2px" />
        Create keychain
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
          <FormLabel>Purpose</FormLabel>
          <InputGroup>
            <Input value={purpose} onChange={e => setPurpose(e.target.value)} />
            <InputRightElement>
              <Tooltip
                label="Generate random UUIDv4"
                portalProps={{
                  containerRef: usePortalRef(),
                }}
              >
                <IconButton
                  aria-label="Generate random UUIDv4"
                  icon={<FiRefreshCw />}
                  variant="ghost"
                  rounded="full"
                  size="sm"
                  onClick={() => setPurpose(crypto.randomUUID())}
                />
              </Tooltip>
            </InputRightElement>
          </InputGroup>
          <FormHelperText>What will it be used for?</FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel>Type</FormLabel>
          <Select
            value={type}
            onChange={e => setType(e.target.value as CipherAlgorithm)}
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

const queryKeys = {
  permissions: (key: KeychainItemMetadata) =>
    ['key', 'permissions', key] as const,
  participants: (key: KeychainItemMetadata) =>
    ['key', 'participants', key] as const,
  outgoing: (key: KeychainItemMetadata) => ['key', 'outgoing', key] as const,
}

const KeyDetailsPanel: React.FC<KeyDetailsPanelProps> = ({ keys }) => {
  const client = useE2ESDKClient()
  const identity = useE2ESDKClientIdentity()
  const queryClient = useQueryClient()
  const currentKey = keys[0]
  const { data: permissions } = useQuery({
    queryKey: queryKeys.permissions(currentKey),
    queryFn: ({ queryKey }) =>
      client.getPermissions(queryKey[2].keychainFingerprint),
    enabled: Boolean(currentKey),
  })
  const { data: participants } = useQuery({
    queryKey: queryKeys.participants(currentKey),
    queryFn: ({ queryKey }) =>
      client.getParticipants(
        queryKey[2].keychainFingerprint,
        queryKey[2].keyFingerprint
      ),
    enabled: Boolean(currentKey),
  })
  const { data: outgoingSharedKeys } = useQuery({
    queryKey: queryKeys.outgoing(currentKey),
    queryFn: async ({ queryKey }) => {
      const outgoingSharedKeys = await client.getOutgoingSharedKeys()
      return outgoingSharedKeys.filter(
        key =>
          key.keychainFingerprint === queryKey[2].keychainFingerprint &&
          key.keyFingerprint === queryKey[2].keyFingerprint
      )
    },
    enabled: Boolean(currentKey),
  })
  const otherParticipants =
    participants?.filter(p => !!identity && p.userId !== identity.userId) ?? []
  const rotateKey = React.useCallback(() => {
    client.rotateKey(currentKey.keychainFingerprint)
  }, [client, currentKey])

  if (!currentKey) {
    return (
      <Center h="100%" color="gray.500" fontSize="xs">
        Key set is empty
      </Center>
    )
  }
  const showParticipantActions =
    permissions?.allowManagement || permissions?.allowDeletion
  return (
    <>
      <SectionHeader icon={FiKey} display="flex" alignItems="center">
        Current key
        <Stack isInline spacing={2} ml="auto" my={-2} mr={-3}>
          <Button
            ml="auto"
            size="xs"
            variant="ghost"
            rounded="full"
            colorScheme="yellow"
            leftIcon={<FiRefreshCw />}
            onClick={rotateKey}
          >
            Rotate
          </Button>
          <Button
            size="xs"
            variant="ghost"
            rounded="full"
            colorScheme="red"
            leftIcon={<FiTrash2 />}
            onClick={() =>
              client.deleteKey(
                currentKey.keychainFingerprint,
                currentKey.keyFingerprint
              )
            }
          >
            Delete
          </Button>
        </Stack>
      </SectionHeader>
      <Grid
        templateColumns="8rem 1fr"
        px={4}
        rowGap={1}
        fontSize="xs"
        alignItems="center"
      >
        <Text fontWeight="semibold">Algorithm</Text>
        <AlgorithmBadge algorithm={currentKey.algorithm} />
        <Text fontWeight="semibold">Fingerprint</Text>
        <Text fontFamily="mono" color="gray.500">
          {currentKey.keyFingerprint}
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
        <Text fontWeight="semibold">Permissions</Text>
        {permissions ? (
          <PermissionIcons {...permissions} color="gray.500" />
        ) : (
          <Spinner size="sm" />
        )}
      </Grid>
      <SectionHeader mt={4} icon={FiUsers}>
        Participants
        <ShareKeyPopup
          ml="auto"
          isDisabled={!permissions?.allowSharing}
          currentKey={currentKey}
        />
      </SectionHeader>
      {!participants ? (
        <Center h={8} mb={-4}>
          <Spinner />
        </Center>
      ) : otherParticipants.length === 0 ? (
        <Center h={8} color="gray.500" fontSize="xs" mb={-4}>
          No one else has access to this key
        </Center>
      ) : (
        <TableContainer>
          <Table size="sm" mt={-2}>
            <Thead>
              <Tr>
                <Th>User ID</Th>
                <Th>Added</Th>
                <Th>Shared from</Th>
                <Th>Permissions</Th>
                {showParticipantActions && <Th>Actions</Th>}
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
              {otherParticipants.map(p => (
                <Tr key={p.userId} fontFamily="mono">
                  <Td>{p.userId}</Td>
                  <Td>{new Date(p.addedAt).toLocaleString(['se-SE'])}</Td>
                  <Td
                    fontStyle={
                      p.sharedBy === identity?.userId ? 'italic' : 'normal'
                    }
                  >
                    {p.sharedBy === identity?.userId
                      ? 'you'
                      : p.sharedBy ?? <em>null</em>}
                  </Td>
                  <Td>
                    <PermissionIcons
                      spacing={2}
                      allowSharing={p.allowSharing}
                      allowRotation={p.allowRotation}
                      allowDeletion={p.allowDeletion}
                      allowManagement={p.allowManagement}
                    />
                  </Td>
                  {showParticipantActions && (
                    <Td w={10}>
                      <Stack isInline spacing={2}>
                        {permissions?.allowManagement && (
                          <ManagePermissionsPopup
                            participant={p}
                            currentKey={currentKey}
                          />
                        )}
                        {permissions?.allowDeletion && (
                          <IconButton
                            aria-label="Ban user"
                            title="Ban user"
                            icon={<FiUserMinus />}
                            size="xs"
                            variant="ghost"
                            rounded="full"
                            colorScheme="red"
                            onClick={() =>
                              client
                                .banUser(
                                  p.userId,
                                  currentKey.keychainFingerprint
                                )
                                .then(() =>
                                  queryClient.invalidateQueries(
                                    queryKeys.participants(currentKey)
                                  )
                                )
                            }
                          />
                        )}
                      </Stack>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
      {(outgoingSharedKeys?.length ?? 0) > 0 && (
        <>
          <SectionHeader icon={FiClock} mt={8}>
            Pending shared keys
          </SectionHeader>
          <TableContainer>
            <Table size="sm" mt={-2}>
              <Thead>
                <Tr>
                  <Th>Recipient</Th>
                  <Th>Fingerprint</Th>
                  <Th>Expires</Th>
                  <Th></Th>
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
                {outgoingSharedKeys!.map(key => (
                  <Tr
                    key={
                      key.toUserId +
                      key.keychainFingerprint +
                      key.keyFingerprint
                    }
                    fontFamily="mono"
                  >
                    <Td>{key.toUserId}</Td>
                    <Td>{key.keyFingerprint}</Td>
                    <Td>
                      {key.expiresAt ? (
                        new Date(key.expiresAt).toLocaleString(['se-SE'])
                      ) : (
                        <em>never</em>
                      )}
                    </Td>
                    <Td>
                      <IconButton
                        aria-label="Revoke"
                        icon={<FiTrash2 />}
                        size="xs"
                        variant="ghost"
                        rounded="full"
                        colorScheme="red"
                        onClick={() =>
                          client
                            .deleteOutgoingSharedKey(
                              key.toUserId,
                              key.keyFingerprint
                            )
                            .then(() =>
                              queryClient.invalidateQueries(
                                queryKeys.outgoing(currentKey)
                              )
                            )
                        }
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </>
      )}
      {keys.length > 1 && (
        <>
          <SectionHeader icon={FiArchive} mt={8}>
            Previous Keys
          </SectionHeader>
          <TableContainer>
            <Table size="sm" mt={-2}>
              <Thead>
                <Tr>
                  <Th>Fingerprint</Th>
                  {currentKey.publicKey && <Th>Public Key</Th>}
                  <Th>Created</Th>
                  <Th>Expires</Th>
                  <Th>Shared from</Th>
                  <Th></Th>
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
                    <Td>{key.keyFingerprint}</Td>
                    {key.publicKey && <Td>{key.publicKey}</Td>}
                    <Td>{key.createdAt.toLocaleString(['se-SE'])}</Td>
                    <Td>
                      {key.expiresAt?.toLocaleString(['se-SE']) ?? (
                        <em>never</em>
                      )}
                    </Td>
                    <Td>{key.sharedBy ?? <em>null</em>}</Td>
                    <Td>
                      <IconButton
                        aria-label="Delete"
                        icon={<FiTrash2 />}
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        rounded="full"
                        onClick={() =>
                          client.deleteKey(
                            key.keychainFingerprint,
                            key.keyFingerprint
                          )
                        }
                      />
                    </Td>
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
  as: IconType
  action: string
  allowed: boolean | undefined
}

const PermissionIcon: React.FC<PermissionIconProps> = ({
  as,
  allowed,
  action,
  ...props
}) => (
  <Icon
    as={as}
    opacity={allowed ? 1 : 0.5}
    strokeWidth={2.5}
    title={`${allowed ? 'Can' : 'Cannot'} ${action}`}
    {...props}
  />
)

// --

type PermissionFlags = Awaited<ReturnType<Client['getPermissions']>>
type PermissionsIconsProps = StackProps & PermissionFlags

const PermissionIcons: React.FC<PermissionsIconsProps> = ({
  allowSharing,
  allowRotation,
  allowDeletion,
  allowManagement,
  ...props
}) => (
  <Stack isInline spacing={4} {...props}>
    <PermissionIcon as={FiShare2} allowed={allowSharing} action="share" />
    <PermissionIcon as={FiRotateCw} allowed={allowRotation} action="rotate" />
    <PermissionIcon
      as={FiUserMinus}
      allowed={allowDeletion}
      action="ban others"
    />
    <PermissionIcon
      as={FiSliders}
      allowed={allowManagement}
      action="manage permissions"
    />
  </Stack>
)

// --

type ShareKeyPopupProps = Omit<ButtonProps, 'onClick'> & {
  currentKey: KeychainItemMetadata
}

const ShareKeyPopup: React.FC<ShareKeyPopupProps> = ({
  currentKey,
  ...props
}) => {
  const { isOpen, onClose, onToggle } = useDisclosure()
  const client = useE2ESDKClient()
  const queryClient = useQueryClient()
  const [recipientIdentity, setRecipientIdentity] =
    React.useState<PublicUserIdentity | null>(null)
  const close = React.useCallback(() => {
    setRecipientIdentity(null)
    onClose()
  }, [])

  const share = useMutation({
    mutationFn: () =>
      client.shareKey(currentKey.keychainFingerprint, recipientIdentity!),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.outgoing(currentKey))
      close()
    },
  })
  const portalRef = usePortalRef()
  return (
    <Popover isOpen={isOpen} onClose={close}>
      <PopoverTrigger>
        <Button
          ml="auto"
          my={-2}
          size="xs"
          rounded="full"
          variant="ghost"
          colorScheme={algorithmColors[currentKey.algorithm]}
          leftIcon={<FiShare2 />}
          {...props}
          onClick={onToggle}
        >
          Share
        </Button>
      </PopoverTrigger>
      <Portal containerRef={portalRef}>
        <PopoverContent minW="lg">
          <FocusLock returnFocus persistentFocus={false}>
            <PopoverArrow />
            <PopoverCloseButton rounded="full" mt={1} />
            <PopoverHeader
              display="flex"
              alignItems="center"
              fontWeight="medium"
            >
              <Icon as={FiShare2} mr={2} />
              Share key with
            </PopoverHeader>
            <PopoverBody fontWeight="md">
              <UserIdentityInput
                identity={recipientIdentity}
                onIdentityChange={setRecipientIdentity}
                showPublicKey
                mb={4}
              />
              <Button
                width="100%"
                colorScheme={algorithmColors[currentKey.algorithm]}
                leftIcon={<FiShare2 />}
                isDisabled={!recipientIdentity}
                isLoading={share.isLoading}
                onClick={() => share.mutateAsync()}
              >
                Share{' '}
                {currentKey.algorithm === 'secretBox'
                  ? 'secret key'
                  : 'key pair'}
              </Button>
              {share.isError && (
                <Text
                  color="red.600"
                  _dark={{ color: 'red.400' }}
                  fontSize="sm"
                  my={2}
                >
                  {String(share.error)}
                </Text>
              )}
            </PopoverBody>
          </FocusLock>
        </PopoverContent>
      </Portal>
    </Popover>
  )
}

// --

type ManagePermissionsPopupProps = Omit<
  IconButtonProps,
  'onClick' | 'aria-label'
> & {
  participant: Awaited<ReturnType<Client['getParticipants']>>[number]
  currentKey: KeychainItemMetadata
}

const ManagePermissionsPopup: React.FC<ManagePermissionsPopupProps> = ({
  participant,
  currentKey,
  ...props
}) => {
  const { isOpen, onClose, onToggle } = useDisclosure()
  const portalRef = usePortalRef()
  const client = useE2ESDKClient()
  const queryClient = useQueryClient()

  const [allowSharing, setAllowSharing] = React.useState(
    participant.allowSharing
  )
  const [allowRotation, setAllowRotation] = React.useState(
    participant.allowRotation
  )
  const [allowDeletion, setAllowDeletion] = React.useState(
    participant.allowDeletion
  )
  const [allowManagement, setAllowManagement] = React.useState(
    participant.allowManagement
  )

  React.useEffect(() => {
    setAllowSharing(participant.allowSharing)
    setAllowRotation(participant.allowRotation)
    setAllowDeletion(participant.allowDeletion)
    setAllowManagement(participant.allowManagement)
  }, [isOpen])

  const setPermissions = useMutation({
    mutationFn: () =>
      client.setPermissions(
        participant.userId,
        currentKey.keychainFingerprint,
        {
          allowSharing,
          allowRotation,
          allowDeletion,
          allowManagement,
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.participants(currentKey))
      onClose()
    },
  })

  return (
    <Popover isOpen={isOpen} onClose={onClose}>
      <PopoverTrigger>
        <IconButton
          aria-label="Manage permissions"
          title="Manage permissions"
          icon={<FiSliders />}
          size="xs"
          variant="ghost"
          rounded="full"
          {...props}
          onClick={onToggle}
        />
      </PopoverTrigger>
      <Portal containerRef={portalRef}>
        <PopoverContent minW="lg">
          <FocusLock returnFocus persistentFocus={false}>
            <PopoverArrow />
            <PopoverCloseButton rounded="full" mt={1} />
            <PopoverHeader
              display="flex"
              alignItems="center"
              fontWeight="medium"
            >
              <Icon as={FiSliders} mr={2} />
              Manage permissions
            </PopoverHeader>
            <PopoverBody fontWeight="md">
              <Stack mt={2} mb={4}>
                <HStack>
                  <Icon as={FiShare2} color="gray.500" />
                  <Checkbox
                    isChecked={allowSharing}
                    onChange={e => setAllowSharing(e.target.checked)}
                  >
                    Allow sharing
                  </Checkbox>
                </HStack>
                <HStack>
                  <Icon as={FiRotateCw} color="gray.500" />
                  <Checkbox
                    isChecked={allowRotation}
                    onChange={e => setAllowRotation(e.target.checked)}
                  >
                    Allow key rotation
                  </Checkbox>
                </HStack>
                <HStack>
                  <Icon as={FiUserMinus} color="gray.500" />
                  <Checkbox
                    isChecked={allowDeletion}
                    onChange={e => setAllowDeletion(e.target.checked)}
                  >
                    Allow banning other users
                  </Checkbox>
                </HStack>
                <HStack>
                  <Icon as={FiSliders} color="gray.500" />
                  <Checkbox
                    isChecked={allowManagement}
                    onChange={e => setAllowManagement(e.target.checked)}
                  >
                    Grant permission management rights
                  </Checkbox>
                </HStack>
              </Stack>
              <Button
                width="100%"
                colorScheme={algorithmColors[currentKey.algorithm]}
                leftIcon={<FiSliders />}
                onClick={() => setPermissions.mutateAsync()}
                isLoading={setPermissions.isLoading}
              >
                Update permissions
              </Button>
              {setPermissions.isError && (
                <Text
                  color="red.600"
                  _dark={{ color: 'red.400' }}
                  fontSize="sm"
                  my={2}
                >
                  {String(setPermissions.error)}
                </Text>
              )}
            </PopoverBody>
          </FocusLock>
        </PopoverContent>
      </Portal>
    </Popover>
  )
}
