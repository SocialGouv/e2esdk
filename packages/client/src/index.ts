import {
  fingerprintSchema,
  getKeychainResponseBody,
  GetKeychainResponseBody,
  getMultipleIdentitiesResponseBody,
  GetMultipleIdentitiesResponseBody,
  getParticipantsResponseBody,
  GetParticipantsResponseBody,
  getSharedKeysResponseBody,
  GetSharedKeysResponseBody,
  getSingleIdentityResponseBody,
  GetSingleIdentityResponseBody,
  identitySchema as apiIdentitySchema,
  isFarFromCurrentTime,
  Optional,
  permissionFlags,
  PermissionFlags,
  PostBanRequestBody,
  PostKeychainItemRequestBody,
  PostPermissionRequestBody,
  PostSharedKeyBody,
  publicKeyAuthHeaders,
  signedHashSchema,
  signupBody,
  SignupBody,
  sixtyFourBytesBase64Schema,
  thirtyTwoBytesBase64Schema,
  timestampSchema,
  WebsocketNotificationTypes,
  websocketNotificationTypesSchema,
} from '@e2esdk/api'
import {
  base64UrlDecode,
  base64UrlEncode,
  BoxCipher,
  Cipher,
  cipherParser,
  CIPHER_MAX_PADDED_LENGTH,
  decrypt,
  decryptFormData,
  deriveClientIdentity,
  encodedCiphertextFormatV1,
  encrypt,
  EncryptableJSONDataType,
  EncryptedFormSubmission,
  fingerprint,
  memzeroCipher,
  multipartSignature,
  numberToUint32LE,
  randomPad,
  SecretBoxCipher,
  serializeCipher,
  signAuth as signClientRequest,
  Sodium,
  sodium,
  verifyAuth as verifyServerSignature,
  verifyClientIdentity,
  verifyMultipartSignature,
} from '@e2esdk/crypto'
import { LocalStateSync } from 'local-state-sync'
import mitt, { Emitter } from 'mitt'
import { z } from 'zod'

export type ClientConfig<KeyType = string> = {
  serverURL: string
  serverPublicKey: KeyType // todo: Make this an array to allow server key rotation
  handleNotifications?: boolean
}

type Config = Required<ClientConfig<Uint8Array>> & {
  clientId: string
}

// --

const stringSchema = z.string()

// --

const key32Schema = thirtyTwoBytesBase64Schema.transform(base64UrlDecode)
const key64Schema = sixtyFourBytesBase64Schema.transform(base64UrlDecode)

// --

const boxKeyPairSchema = z.object({
  publicKey: key32Schema,
  privateKey: key32Schema,
})

const signatureKeyPairSchema = z.object({
  publicKey: key32Schema,
  privateKey: key64Schema,
})

// --

const keychainItemSchema = z.object({
  name: z.string(),
  nameFingerprint: fingerprintSchema,
  payloadFingerprint: fingerprintSchema,
  cipher: z
    .string()
    .transform(input => cipherParser.parse(JSON.parse(input.trim()))),
  createdAt: timestampSchema.transform(value => new Date(value)),
  expiresAt: timestampSchema.transform(value => new Date(value)).nullable(),
  sharedBy: apiIdentitySchema.shape.userId.nullable(),
})

type KeychainItem = z.infer<typeof keychainItemSchema>

export type KeychainItemMetadata = Pick<
  KeychainItem,
  | 'name'
  | 'nameFingerprint'
  | 'payloadFingerprint'
  | 'createdAt'
  | 'expiresAt'
  | 'sharedBy'
> & {
  algorithm: Cipher['algorithm']
  publicKey?: string
}

// --

const keychainSchema = z.array(keychainItemSchema).transform(array =>
  array.reduce((map, item) => {
    map.set(
      item.nameFingerprint,
      [...(map.get(item.nameFingerprint) ?? []), item].sort(
        byCreatedAtMostRecentFirst
      )
    )
    return map
  }, new Map<string, KeychainItem[]>())
)

type Keychain = z.infer<typeof keychainSchema>

// --

const identitySchema = z.object({
  userId: apiIdentitySchema.shape.userId,
  keychainBaseKey: key32Schema,
  sharing: boxKeyPairSchema,
  signature: signatureKeyPairSchema,
  proof: signedHashSchema,
})

type Identity = z.infer<typeof identitySchema>

export type PublicUserIdentity = {
  userId: string
  signaturePublicKey: string
  sharingPublicKey: string
  proof: string
}

// --

type ShareKeyOptions = {
  expiresAt?: Date
}

// --

const idleStateSchema = z.object({
  state: z.literal('idle'),
})

const loadedStateSchema = z.object({
  state: z.literal('loaded'),
  identity: identitySchema,
  keychain: keychainSchema,
})

const stateSchema = z.discriminatedUnion('state', [
  idleStateSchema,
  loadedStateSchema,
])

type State = z.infer<typeof stateSchema>

// --

type Events = {
  identityUpdated: PublicUserIdentity | null
  keychainUpdated: null
  keyReceived: KeychainItemMetadata
}

// --

type HTTPMethod = 'GET' | 'POST' | 'DELETE'

// --

export class Client {
  public readonly sodium: Sodium
  public readonly config: Readonly<Config>
  #state: State
  #mitt: Emitter<Events>
  #sync: LocalStateSync<State>
  #socket?: WebSocket

  constructor(config: ClientConfig) {
    this.sodium = sodium
    this.config = Object.freeze({
      serverURL: config.serverURL,
      serverPublicKey: this.decode(config.serverPublicKey),
      handleNotifications: config.handleNotifications ?? true,
      clientId: crypto.randomUUID(),
    })
    this.#state = {
      state: 'idle',
    }
    this.#mitt = mitt()
    this.#sync = new LocalStateSync({
      encryptionKey: 'E2ESDKClientLocalStateSyncEncryptionKey1234',
      namespace: [config.serverURL, config.serverPublicKey].join(':'),
      onStateUpdated: incomingState => {
        if (incomingState.state === 'idle') {
          this.#clearState()
          return
        }
        const initialize = this.#state.state === 'idle'
        this.#state = incomingState
        this.#mitt.emit('identityUpdated', this.publicIdentity)
        this.#mitt.emit('keychainUpdated', null)
        const promiseChain = this.sodium.ready.then(
          this.#verifySelfIdentity.bind(this)
        )
        if (initialize) {
          promiseChain
            .then(this.#loadKeychain.bind(this))
            .then(this.#processIncomingSharedKeys.bind(this))
            .then(this.#startWebSocket.bind(this, 'init'))
            .catch(console.error)
        }
      },
      stateParser,
      stateSerializer,
    })
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'visibilitychange',
        this.#handleVisibilityChange.bind(this)
      )
    }
  }

  // Event Emitter --

  public on<K extends keyof Events>(
    event: K,
    callback: (arg: Events[K]) => void
  ) {
    this.#mitt.on(event, callback)
    return () => this.#mitt.off(event, callback)
  }

  // Auth --

  public async signup(userId: string, mainKey: Uint8Array) {
    await this.sodium.ready
    if (this.#state.state !== 'idle') {
      throw new Error(
        'Please log out of your current account before signing up for another one'
      )
    }
    const identity = deriveClientIdentity(this.sodium, userId, mainKey)
    const body: SignupBody = {
      userId,
      signaturePublicKey: this.encode(identity.signature.publicKey),
      sharingPublicKey: this.encode(identity.sharing.publicKey),
      proof: identity.proof,
    }
    this.#state = {
      state: 'loaded',
      identity,
      keychain: new Map(),
    }
    try {
      const response = signupBody.parse(
        await this.#apiCall('POST', '/v1/signup', body)
      )
      if (
        response.userId !== body.userId ||
        response.signaturePublicKey !== body.signaturePublicKey ||
        response.sharingPublicKey !== body.sharingPublicKey ||
        response.proof !== body.proof
      ) {
        throw new Error('Signup failed: could not authenticate server')
      }
      this.#startWebSocket('signup')
      this.#mitt.emit('identityUpdated', this.publicIdentity)
      this.#sync.setState(this.#state)
      return this.publicIdentity
    } catch (error) {
      this.#clearState() // Cleanup on failure
      throw error
    }
  }

  public async login(userId: string, mainKey: Uint8Array) {
    await this.sodium.ready
    this.#clearState()
    const identity = deriveClientIdentity(this.sodium, userId, mainKey)
    this.#state = {
      state: 'loaded',
      identity,
      keychain: new Map(),
    }
    // Load keychain & incoming shared keys in the background
    this.#loadKeychain()
      .then(() => this.#processIncomingSharedKeys())
      .then(() => this.#startWebSocket('login'))
      .catch(console.error)
    this.#mitt.emit('identityUpdated', this.publicIdentity)
    this.#sync.setState(this.#state)
    return this.publicIdentity
  }

  public logout() {
    this.#clearState()
    this.#sync.setState(this.#state)
  }

  // Key Ops --

  public async addKey({
    name,
    cipher,
    createdAt = new Date(),
    expiresAt = null,
    sharedBy = null,
  }: Optional<
    Omit<KeychainItem, 'nameFingerprint' | 'payloadFingerprint'>,
    'createdAt' | 'expiresAt' | 'sharedBy'
  >): Promise<KeychainItemMetadata> {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    const nameFingerprint = fingerprint(this.sodium, name)
    const serializedCipher = serializeCipher(cipher)
    if (this.#state.keychain.has(nameFingerprint)) {
      // Make sure the cipher algorithm remains the same,
      // but the key itself is different, for rotations.
      const [existingKey] = this.#state.keychain.get(nameFingerprint)!
      if (cipher.algorithm !== existingKey.cipher.algorithm) {
        throw new Error(
          `Cannot rotate key ${nameFingerprint} with different algorithm`
        )
      }
      if (serializedCipher === serializeCipher(existingKey.cipher)) {
        throw new Error('This key is already in your keychain')
      }
    }
    const subkeyIndex = this.sodium.randombytes_uniform(0x7fffffff) // Make it unsigned
    const { nameCipher, payloadCipher } = this.#deriveKeychainKeys(subkeyIndex)
    const payloadFingerprint = fingerprint(this.sodium, serializedCipher)
    const createdAtISO = createdAt.toISOString()
    const expiresAtISO = expiresAt?.toISOString() ?? null
    const body: PostKeychainItemRequestBody = {
      ownerId: this.#state.identity.userId,
      sharedBy,
      createdAt: createdAtISO,
      expiresAt: expiresAtISO,
      subkeyIndex,
      name: encrypt(this.sodium, name, nameCipher, encodedCiphertextFormatV1),
      payload: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        payloadCipher,
        encodedCiphertextFormatV1
      ),
      nameFingerprint,
      payloadFingerprint,
      signature: this.encode(
        multipartSignature(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(sharedBy ?? ''),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
          numberToUint32LE(subkeyIndex),
          this.sodium.from_base64(nameFingerprint),
          this.sodium.from_base64(payloadFingerprint)
        )
      ),
    }
    await this.#apiCall('POST', '/v1/keychain', body)
    // todo: Handle API errors
    addToKeychain(this.#state.keychain, {
      name,
      nameFingerprint,
      payloadFingerprint,
      cipher,
      createdAt,
      expiresAt,
      sharedBy,
    })
    this.#mitt.emit('keychainUpdated', null)
    this.#sync.setState(this.#state)
    return {
      name,
      nameFingerprint,
      payloadFingerprint,
      algorithm: cipher.algorithm,
      publicKey:
        cipher.algorithm !== 'secretBox'
          ? this.encode(cipher.publicKey)
          : undefined,
      createdAt,
      expiresAt,
      sharedBy,
    }
  }

  public get keys() {
    if (this.#state.state !== 'loaded') {
      return {}
    }
    const out: Record<string, KeychainItemMetadata[]> = {}
    this.#state.keychain.forEach(items => {
      if (items.length === 0) {
        return
      }
      out[items[0].nameFingerprint] = items
        .map(getKeychainItemMetadata)
        .sort(byCreatedAtMostRecentFirst)
    })
    return out
  }

  // Sharing --

  public async shareKey(
    nameFingerprint: string,
    to: PublicUserIdentity,
    { expiresAt }: ShareKeyOptions = {}
  ) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account must be unlocked before sending keys')
    }
    const keychainItem = this.#state.keychain.get(nameFingerprint)?.[0]
    if (!keychainItem) {
      throw new Error(
        `No available key to share with fingerprint ${nameFingerprint}`
      )
    }
    const sendTo: BoxCipher = {
      algorithm: 'box',
      privateKey: this.#state.identity.sharing.privateKey,
      publicKey: this.decode(to.sharingPublicKey),
    }
    const serializedCipher = serializeCipher(keychainItem.cipher)
    // Remove padding for payload fingerprint as it is not deterministic
    const payloadFingerprint = fingerprint(this.sodium, serializedCipher)
    const createdAtISO = keychainItem.createdAt.toISOString()
    const expiresAtISO =
      expiresAt?.toISOString() ?? keychainItem.expiresAt?.toISOString() ?? null
    const body: PostSharedKeyBody = {
      fromUserId: this.#state.identity.userId,
      fromSharingPublicKey: this.encode(this.#state.identity.sharing.publicKey),
      fromSignaturePublicKey: this.encode(
        this.#state.identity.signature.publicKey
      ),
      fromProof: this.#state.identity.proof,
      toUserId: to.userId,
      createdAt: createdAtISO,
      expiresAt: expiresAtISO,
      name: encrypt(
        this.sodium,
        keychainItem.name,
        sendTo,
        encodedCiphertextFormatV1
      ),
      payload: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        sendTo,
        encodedCiphertextFormatV1
      ),
      nameFingerprint,
      payloadFingerprint,
      signature: this.encode(
        multipartSignature(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(to.userId),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
          this.decode(nameFingerprint),
          this.decode(payloadFingerprint),
          this.#state.identity.sharing.publicKey,
          this.#state.identity.signature.publicKey,
          this.decode(this.#state.identity.proof)
        )
      ),
    }
    await this.#apiCall('POST', '/v1/shared-keys', body)
  }

  public async getOutgoingSharedKeys() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    return getSharedKeysResponseBody.parse(
      await this.#apiCall<GetSharedKeysResponseBody>(
        'GET',
        '/v1/shared-keys/outgoing'
      )
    )
  }

  public async deleteOutgoingSharedKey(
    toUserId: string,
    payloadFingerprint: string
  ) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    await this.#apiCall(
      'DELETE',
      `/v1/shared-keys/${toUserId}/${payloadFingerprint}`
    )
  }

  // User Ops --

  public get publicIdentity(): PublicUserIdentity {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    return {
      userId: this.#state.identity.userId,
      sharingPublicKey: this.encode(this.#state.identity.sharing.publicKey),
      signaturePublicKey: this.encode(this.#state.identity.signature.publicKey),
      proof: this.#state.identity.proof,
    }
  }

  public async getUserIdentity(
    userId: string
  ): Promise<PublicUserIdentity | null> {
    await this.sodium.ready
    try {
      const identity = getSingleIdentityResponseBody.parse(
        await this.#apiCall<GetSingleIdentityResponseBody>(
          'GET',
          `/v1/identity/${userId}`
        )
      )
      if (!identity) {
        return null
      }
      if (identity.userId !== userId) {
        throw new Error('Mismatching user IDs')
      }
      if (!verifyClientIdentity(this.sodium, identity)) {
        console.error('Failed to verify user identity: ', identity)
        return null
      }
      return identity
    } catch (error) {
      console.error(error)
      return null
    }
  }

  public async getUsersIdentities(
    userIds: string[]
  ): Promise<PublicUserIdentity[]> {
    await this.sodium.ready
    try {
      const identities = getMultipleIdentitiesResponseBody.parse(
        await this.#apiCall<GetMultipleIdentitiesResponseBody>(
          'GET',
          `/v1/identities/${userIds.join(',')}`
        )
      )
      return identities.filter(identity => {
        if (verifyClientIdentity(this.sodium, identity)) {
          return true
        }
        console.warn('Failed to verify user identity (dropping): ', identity)
        return false
      })
    } catch (error) {
      console.error(error)
      return []
    }
  }

  public async getParticipants(
    nameFingerprint: string,
    payloadFingerprint: string
  ) {
    await this.sodium.ready
    try {
      const participants = getParticipantsResponseBody.parse(
        await this.#apiCall<GetParticipantsResponseBody>(
          'GET',
          `/v1/participants/${nameFingerprint}/${payloadFingerprint}`
        )
      )
      return participants.filter(participant => {
        if (verifyClientIdentity(this.sodium, participant)) {
          return true
        }
        console.warn('Failed to verify user identity (dropping): ', participant)
        return false
      })
    } catch (error) {
      console.error(error)
      return []
    }
  }

  // Permissions --

  public async getPermissions(nameFingerpint: string) {
    const url = `/v1/permissions/${nameFingerpint}`
    return permissionFlags.parse(await this.#apiCall('GET', url))
  }

  public async setPermissions(
    userId: string,
    nameFingerprint: string,
    permissions: Partial<PermissionFlags>
  ) {
    const body: PostPermissionRequestBody = {
      userId,
      nameFingerprint,
      ...permissions,
    }
    await this.#apiCall('POST', '/v1/permissions', body)
  }

  public async banUser(userId: string, nameFingerprint: string) {
    const body: PostBanRequestBody = {
      userId,
      nameFingerprint,
    }
    await this.#apiCall('POST', '/v1/ban', body)
  }

  // Encryption / Decryption --

  public encrypt<DataType extends EncryptableJSONDataType | Uint8Array>(
    input: DataType,
    nameFingerprint: string
  ) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked: cannot encrypt')
    }
    const currentKey = this.#state.keychain.get(nameFingerprint)?.[0]
    if (!currentKey) {
      throw new Error(`No key found with name fingerprint ${nameFingerprint}`)
    }
    if ((currentKey.expiresAt?.valueOf() ?? Infinity) < Date.now()) {
      throw new Error(
        `Key ${nameFingerprint}:${currentKey.payloadFingerprint} has expired`
      )
    }
    return encrypt(
      this.sodium,
      input,
      currentKey.cipher,
      'application/e2esdk.ciphertext.v1'
    )
  }

  public decrypt(ciphertext: string, nameFingerpint: string) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked: cannot decrypt')
    }
    const keys = this.#state.keychain.get(nameFingerpint) ?? []
    if (keys.length === 0) {
      throw new Error(`No key found with name fingerprint ${nameFingerpint}`)
    }
    for (const key of keys) {
      try {
        return decrypt(
          this.sodium,
          ciphertext,
          key.cipher,
          'application/e2esdk.ciphertext.v1'
        )
      } catch {
        continue
      }
    }
    throw new Error('Failed to decrypt: exhausted all available keys')
  }

  public unsealFormData<FormData extends object>(
    submission: EncryptedFormSubmission<FormData>,
    nameFingerpint: string
  ): Record<keyof FormData, unknown> {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked: cannot decrypt')
    }
    const keys = this.#state.keychain.get(nameFingerpint) ?? []
    if (keys.length === 0) {
      throw new Error(`No key found with name fingerprint ${nameFingerpint}`)
    }
    for (const key of keys) {
      try {
        if (key.cipher.algorithm !== 'sealedBox') {
          throw new Error('invalid algorithm')
        }
        return decryptFormData<FormData>(this.sodium, submission, key.cipher)
      } catch (error) {
        console.warn(error)
        continue
      }
    }
    throw new Error('Failed to decrypt: exhausted all available keys')
  }

  // Helpers --
  // We're not using the sodium conversions because those need it
  // to be ready, and we want to be able to encode/decode at any time.

  public encode(input: Uint8Array) {
    return base64UrlEncode(input)
  }

  public decode(input: string) {
    return base64UrlDecode(input)
  }

  // Internal APIs --

  #verifySelfIdentity() {
    if (this.#state.state !== 'loaded') {
      return
    }
    const verified = verifyClientIdentity(this.sodium, {
      userId: this.#state.identity.userId,
      sharingPublicKey: this.encode(this.#state.identity.sharing.publicKey),
      signaturePublicKey: this.encode(this.#state.identity.signature.publicKey),
      proof: this.#state.identity.proof,
    })
    if (verified) {
      return
    }
    console.error('Failed to verify self identity, logging out')
    this.logout()
  }

  async #loadKeychain() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account must be unlocked before calling API')
    }
    const res = getKeychainResponseBody.parse(
      await this.#apiCall<GetKeychainResponseBody>('GET', '/v1/keychain')
    )
    const keychain = new Map<string, KeychainItem[]>()
    for (const lockedItem of res) {
      if (lockedItem.ownerId !== this.#state.identity.userId) {
        console.warn('Got a key belonging to someone else', lockedItem)
        continue
      }
      if (
        !verifyMultipartSignature(
          this.sodium,
          this.#state.identity.signature.publicKey,
          this.decode(lockedItem.signature),
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(lockedItem.sharedBy ?? ''),
          this.sodium.from_string(lockedItem.createdAt),
          this.sodium.from_string(lockedItem.expiresAt ?? ''),
          numberToUint32LE(lockedItem.subkeyIndex),
          this.sodium.from_base64(lockedItem.nameFingerprint),
          this.sodium.from_base64(lockedItem.payloadFingerprint)
        )
      ) {
        console.warn('Invalid keychain entry detected:', lockedItem)
        continue
      }
      const { nameCipher, payloadCipher } = this.#deriveKeychainKeys(
        lockedItem.subkeyIndex
      )

      // todo: Decryption error handling
      const item: KeychainItem = {
        name: stringSchema.parse(
          decrypt(
            this.sodium,
            lockedItem.name,
            nameCipher,
            encodedCiphertextFormatV1
          )
        ),
        nameFingerprint: lockedItem.nameFingerprint,
        payloadFingerprint: lockedItem.payloadFingerprint,
        cipher: cipherParser.parse(
          JSON.parse(
            stringSchema
              .parse(
                decrypt(
                  this.sodium,
                  lockedItem.payload,
                  payloadCipher,
                  encodedCiphertextFormatV1
                )
              )
              .trim()
          )
        ),
        createdAt: new Date(lockedItem.createdAt),
        expiresAt: lockedItem.expiresAt ? new Date(lockedItem.expiresAt) : null,
        sharedBy: lockedItem.sharedBy,
      }
      if (fingerprint(this.sodium, item.name) !== item.nameFingerprint) {
        console.warn('Invalid name fingerprint:', lockedItem)
        continue
      }
      if (
        fingerprint(this.sodium, serializeCipher(item.cipher)) !==
        item.payloadFingerprint
      ) {
        console.warn('Invalid payload fingerprint', lockedItem)
        continue
      }
      addToKeychain(keychain, item)
    }
    // Clear previous keychain
    this.#state.keychain.forEach(items =>
      items.forEach(item => memzeroCipher(this.sodium, item.cipher))
    )
    this.#state.keychain.clear()
    // And replace with new one
    this.#state.keychain = keychain
    this.#sync.setState(this.#state)
    this.#mitt.emit('keychainUpdated', null)
  }

  async #processIncomingSharedKeys() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      console.error('Account must be unlocked before receiving keys')
      return
    }
    let sharedKeys: GetSharedKeysResponseBody = []
    try {
      sharedKeys = getSharedKeysResponseBody.parse(
        await this.#apiCall<GetSharedKeysResponseBody>(
          'GET',
          '/v1/shared-keys/incoming'
        )
      )
    } catch (error) {
      console.error(error)
    }
    for (const sharedKey of sharedKeys) {
      try {
        if (sharedKey.toUserId !== this.#state.identity.userId) {
          throw new Error("Got a shared key that doesn't belong to us")
        }
        if (
          !verifyMultipartSignature(
            this.sodium,
            this.decode(sharedKey.fromSignaturePublicKey),
            this.decode(sharedKey.signature),
            this.sodium.from_string(sharedKey.fromUserId),
            this.sodium.from_string(this.#state.identity.userId),
            this.sodium.from_string(sharedKey.createdAt),
            this.sodium.from_string(sharedKey.expiresAt ?? ''),
            this.decode(sharedKey.nameFingerprint),
            this.decode(sharedKey.payloadFingerprint),
            this.decode(sharedKey.fromSharingPublicKey),
            this.decode(sharedKey.fromSignaturePublicKey),
            this.decode(sharedKey.fromProof)
          )
        ) {
          throw new Error('Invalid shared key signature')
        }
        if (
          !verifyClientIdentity(this.sodium, {
            userId: sharedKey.fromUserId,
            sharingPublicKey: sharedKey.fromSharingPublicKey,
            signaturePublicKey: sharedKey.fromSignaturePublicKey,
            proof: sharedKey.fromProof,
          })
        ) {
          throw new Error('Could not verify source of incoming shared key')
        }
        const withSharedSecret: BoxCipher = {
          algorithm: 'box',
          privateKey: this.#state.identity.sharing.privateKey,
          publicKey: this.decode(sharedKey.fromSharingPublicKey),
        }
        const item: KeychainItem = {
          name: stringSchema.parse(
            decrypt(
              this.sodium,
              sharedKey.name,
              withSharedSecret,
              encodedCiphertextFormatV1
            )
          ),
          nameFingerprint: sharedKey.nameFingerprint,
          payloadFingerprint: sharedKey.payloadFingerprint,
          cipher: cipherParser.parse(
            JSON.parse(
              stringSchema
                .parse(
                  decrypt(
                    this.sodium,
                    sharedKey.payload,
                    withSharedSecret,
                    encodedCiphertextFormatV1
                  )
                )
                .trim()
            )
          ),
          createdAt: new Date(sharedKey.createdAt),
          expiresAt: sharedKey.expiresAt ? new Date(sharedKey.expiresAt) : null,
          sharedBy: sharedKey.fromUserId,
        }
        // Verify fingerprints
        if (fingerprint(this.sodium, item.name) !== item.nameFingerprint) {
          throw new Error('Invalid shared key name fingerprint')
        }
        if (
          fingerprint(this.sodium, serializeCipher(item.cipher)) !==
          item.payloadFingerprint
        ) {
          throw new Error('Invalid shared key payload fingerprint')
        }
        await this.addKey(item)
        this.#mitt.emit('keyReceived', getKeychainItemMetadata(item))
      } catch (error) {
        console.error(error)
        continue
      }
    }
  }

  #startWebSocket(context: string) {
    if (this.#state.state !== 'loaded') {
      return false
    }
    if (!this.config.handleNotifications) {
      // This is the case for clients managed by Devtools,
      // we assume that there is another client running for
      // the application that will (by default) handle notifications.
      // Having more than one of them react to notifications risks
      // data races in processing incoming shared keys.
      return false
    }
    if (this.#socket && this.#socket.readyState !== WebSocket.CLOSED) {
      // WebSocket is already connected
      return false
    }
    // WebSocket upgrade authentication is done via querystring,
    // as we cannot set custom headers on the underlying HTTP request.
    // See packages/server/src/routes/notifications.ts
    const timestamp = new Date().toISOString()
    const url = new URL('/v1/notifications', this.config.serverURL)
    url.searchParams.set('context', context)
    url.searchParams.set('x-e2esdk-user-id', this.#state.identity.userId)
    url.searchParams.set('x-e2esdk-client-id', this.config.clientId)
    url.searchParams.set('x-e2esdk-timestamp', timestamp)
    url.protocol = url.protocol.replace('http', 'ws')
    const signature = signClientRequest(
      this.sodium,
      this.#state.identity.signature.privateKey,
      {
        timestamp,
        method: 'GET',
        // Note that we sign the URL before applying the signature
        // into the querystring (otherwise we'd be running in circles),
        // so the server will do the same thing for verification.
        url: url.toString(),
        recipientPublicKey: this.config.serverPublicKey,
        userId: this.#state.identity.userId,
        clientId: this.config.clientId,
      }
    )
    url.searchParams.set('x-e2esdk-signature', signature)
    const socket = new WebSocket(url.toString())
    socket.addEventListener('message', event => {
      const res = websocketNotificationTypesSchema.safeParse(event.data)
      if (!res.success) {
        return
      }
      if (res.data === WebsocketNotificationTypes.sharedKeyAdded) {
        // By adding a random delay, we might help solve data races
        // between two clients configured to handle notifications.
        // One case where that might happen is when two windows are
        // open and visible (eg: on different screens or each on half of
        // a shared screen). It does not happen for tabs since the WebSocket
        // is closed when a tab becomes hidden.
        const randomDelay = Math.random() * 2000
        setTimeout(() => this.#processIncomingSharedKeys(), randomDelay)
      }
    })
    this.#socket = socket
    return true
  }

  #stopWebSocket(reason: string) {
    this.#socket?.close(1001, reason)
    this.#socket = undefined
  }

  // API Layer --

  async #apiCall<ResponseType>(
    method: 'GET' | 'DELETE',
    path: string
  ): Promise<unknown>

  async #apiCall<BodyType>(
    method: 'POST',
    path: string,
    body: BodyType
  ): Promise<unknown>

  async #apiCall<BodyType>(
    method: HTTPMethod,
    path: string,
    body?: BodyType
  ): Promise<unknown> {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account must be loaded before calling API')
    }
    const url = `${this.config.serverURL}${path}`
    const json = body ? JSON.stringify(body) : undefined
    const timestamp = new Date().toISOString()
    const signature = signClientRequest(
      this.sodium,
      this.#state.identity.signature.privateKey,
      {
        timestamp,
        method,
        url,
        body: json,
        recipientPublicKey: this.config.serverPublicKey,
        userId: this.#state.identity.userId,
        clientId: this.config.clientId,
      }
    )
    const res = await fetch(url, {
      method,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'origin',
      headers: {
        'content-type': 'application/json',
        'x-e2esdk-user-id': this.#state.identity.userId,
        'x-e2esdk-client-id': this.config.clientId,
        'x-e2esdk-timestamp': timestamp,
        'x-e2esdk-signature': signature,
      },
      body: json,
    })
    if (!res.ok) {
      const { error: statusText, statusCode, message } = await res.json()
      throw new APIError(statusCode, statusText, message)
    }
    return this.#verifyServerResponse(method, res, this.#state.identity)
  }

  async #verifyServerResponse(
    method: HTTPMethod,
    res: Response,
    identity: Identity
  ): Promise<unknown> {
    const now = Date.now()
    const {
      'x-e2esdk-signature': signature,
      'x-e2esdk-client-id': clientId,
      'x-e2esdk-timestamp': timestamp,
      'x-e2esdk-user-id': userId,
    } = publicKeyAuthHeaders.parse(Object.fromEntries(res.headers))
    // res.text() will return "" on empty bodies
    const body = (await res.text()) || undefined
    const verified = verifyServerSignature(
      this.sodium,
      this.config.serverPublicKey,
      signature,
      {
        timestamp,
        method,
        url: res.url,
        body,
        recipientPublicKey: identity.signature.publicKey,
        userId,
        clientId: this.config.clientId,
      }
    )
    if (!verified) {
      throw new Error('Invalid server response signature')
    }
    if (userId !== identity.userId) {
      throw new Error('Mismatching user ID')
    }
    if (clientId !== this.config.clientId) {
      throw new Error('Mismatching client ID')
    }
    if (isFarFromCurrentTime(timestamp, now)) {
      throw new Error(
        'Invalid server response timestamp (too far off current time)'
      )
    }
    return body ? JSON.parse(body) : undefined
  }

  // --

  #deriveKeychainKeys(subkeyIndex: number) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    const nameCipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: this.sodium.crypto_kdf_derive_from_key(
        sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        'nameSubK',
        this.#state.identity.keychainBaseKey
      ),
    }
    const payloadCipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: this.sodium.crypto_kdf_derive_from_key(
        sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        'pyldSubK',
        this.#state.identity.keychainBaseKey
      ),
    }
    return {
      nameCipher,
      payloadCipher,
    }
  }

  // Persistance & cross-tab communication --

  #clearState() {
    this.#stopWebSocket('logging out')
    if (this.#state.state !== 'loaded') {
      return
    }
    this.sodium.memzero(this.#state.identity.keychainBaseKey)
    this.sodium.memzero(this.#state.identity.sharing.privateKey)
    this.sodium.memzero(this.#state.identity.signature.privateKey)
    this.#state.keychain.forEach(items =>
      items.forEach(item => memzeroCipher(this.sodium, item.cipher))
    )
    this.#state.keychain.clear()
    this.#state = {
      state: 'idle',
    }
    this.#mitt.emit('identityUpdated', null)
    this.#mitt.emit('keychainUpdated', null)
  }

  #handleVisibilityChange() {
    if (this.#state.state !== 'loaded') {
      return
    }
    if (typeof document === 'undefined') {
      return
    }
    if (document.visibilityState === 'visible') {
      this.#startWebSocket('document:visible')
    }
    if (document.visibilityState === 'hidden') {
      this.#stopWebSocket('document:hidden')
    }
  }
}

// --

function stateSerializer(state: State) {
  if (state.state === 'idle') {
    return JSON.stringify(state)
  }
  const payload = {
    state: state.state,
    identity: {
      userId: state.identity.userId,
      keychainBaseKey: base64UrlEncode(state.identity.keychainBaseKey),
      sharing: {
        publicKey: base64UrlEncode(state.identity.sharing.publicKey),
        privateKey: base64UrlEncode(state.identity.sharing.privateKey),
      },
      signature: {
        publicKey: base64UrlEncode(state.identity.signature.publicKey),
        privateKey: base64UrlEncode(state.identity.signature.privateKey),
      },
      proof: state.identity.proof,
    },
    keychain: Array.from(state.keychain.values())
      .flat()
      .map(item => ({
        ...item,
        cipher: serializeCipher(item.cipher),
      })),
  }
  return JSON.stringify(payload)
}

function stateParser(input: string): State {
  const result = stateSchema.safeParse(JSON.parse(input))
  if (!result.success) {
    console.error(result.error)
    throw new Error(result.error.message)
  }
  return result.data
}

// --

function serializeKeychainItem(item: KeychainItem) {
  return JSON.stringify({
    ...item,
    cipher: serializeCipher(item.cipher),
  })
}

function addToKeychain(keychain: Keychain, newItem: KeychainItem) {
  const items = keychain.get(newItem.nameFingerprint) ?? []
  if (items.length === 0) {
    keychain.set(newItem.nameFingerprint, [newItem])
    return
  }
  const serialized = serializeKeychainItem(newItem)
  if (
    items.findIndex(item => serializeKeychainItem(item) === serialized) >= 0
  ) {
    return // Already in there
  }
  items.push(newItem)
  items.sort(byCreatedAtMostRecentFirst)
}

function byCreatedAtMostRecentFirst<T extends { createdAt: Date }>(a: T, b: T) {
  return b.createdAt.valueOf() - a.createdAt.valueOf()
}

function getKeychainItemMetadata(item: KeychainItem): KeychainItemMetadata {
  return {
    algorithm: item.cipher.algorithm,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    name: item.name,
    nameFingerprint: item.nameFingerprint,
    payloadFingerprint: item.payloadFingerprint,
    sharedBy: item.sharedBy,
    publicKey:
      item.cipher.algorithm !== 'secretBox'
        ? base64UrlEncode(item.cipher.publicKey)
        : undefined,
  }
}

// --

export class APIError extends Error {
  public readonly statusCode: number
  public readonly statusText: string
  constructor(statusCode: number, statusText: string, message: string) {
    super(message)
    this.name = 'API Error'
    this.statusCode = statusCode
    this.statusText = statusText
  }
}
