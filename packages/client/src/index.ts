import {
  GetKeychainResponseBody,
  GetMultipleIdentitiesResponseBody,
  GetParticipantsResponseBody,
  GetSharedKeysResponseBody,
  GetSingleIdentityResponseBody,
  loginResponseBody,
  permissionFlags,
  PermissionFlags,
  PostBanRequestBody,
  PostKeychainItemRequestBody,
  PostPermissionRequestBody,
  PostSharedKeyBody,
  SignupRequestBody,
} from '@e2esdk/api'
import type { Optional } from '@e2esdk/core'
import { isFarFromCurrentTime } from '@e2esdk/core'
import type { Sodium } from '@e2esdk/crypto'
import {
  base64UrlDecode,
  base64UrlEncode,
  BoxCipher,
  checkEncryptionPublicKey,
  checkSignaturePublicKey,
  cipherParser,
  CIPHER_MAX_PADDED_LENGTH,
  decrypt,
  encodedCiphertextFormatV1,
  encrypt,
  EncryptableJSONDataType,
  fingerprint,
  generateBoxKeyPair,
  generateSignatureKeyPair,
  memzeroCipher,
  randomPad,
  SecretBoxCipher,
  serializeCipher,
  signAuth as signClientRequest,
  signHash,
  sodium,
  verifyAuth as verifyServerSignature,
  verifySignedHash,
} from '@e2esdk/crypto'
import { LocalStateSync } from 'local-state-sync'
import mitt, { Emitter } from 'mitt'
import { z } from 'zod'

export type ClientConfig<KeyType = string> = {
  serverURL: string
  serverPublicKey: KeyType // todo: Make this an array to allow server key rotation
  pollingInterval?: number
}

type Config = Omit<ClientConfig<Key>, 'pollingInterval'> &
  Required<Pick<ClientConfig<Key>, 'pollingInterval'>>

// --

const stringSchema = z.string()

// --

const keySchema = z.string().transform(base64UrlDecode)

type Key = Uint8Array

// --

const keyPairSchema = z.object({
  publicKey: keySchema,
  privateKey: keySchema,
})

// --

const keychainItemSchema = z.object({
  name: z.string(),
  nameFingerprint: z.string(),
  payloadFingerprint: z.string(),
  cipher: z
    .string()
    .transform(input => cipherParser.parse(JSON.parse(input.trim()))),
  createdAt: z.string().transform(value => new Date(value)),
  expiresAt: z
    .string()
    .transform(value => new Date(value))
    .nullable(),
  sharedBy: z.string().nullable(),
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
  algorithm: z.infer<typeof cipherParser>['algorithm']
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
  userId: z.string(),
  sharing: keyPairSchema,
  signature: keyPairSchema,
})

type Identity = z.infer<typeof identitySchema>

export type PublicUserIdentity<KeyType = string> = {
  userId: string
  signaturePublicKey: KeyType
  sharingPublicKey: KeyType
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
  personalKey: keySchema,
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

const DEFAULT_POLLING_INTERVAL = 30_000 // 30 seconds

export class Client {
  public readonly sodium: Sodium
  public readonly config: Readonly<Config>
  #state: State
  #mitt: Emitter<Events>
  #sync: LocalStateSync<State>
  #pollingHandle?: ReturnType<typeof setInterval>

  constructor(config: ClientConfig) {
    this.sodium = sodium
    this.config = Object.freeze({
      serverURL: config.serverURL,
      serverPublicKey: this.decode(config.serverPublicKey),
      pollingInterval: config.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
    })
    this.#state = {
      state: 'idle',
    }
    this.#mitt = mitt()
    this.#sync = new LocalStateSync({
      encryptionKey: 'E2ESDKDevtoolsLocalStateSyncEncryptionKey01',
      namespace: [config.serverURL, config.serverPublicKey].join(':'),
      onStateUpdated: state => {
        if (state.state === 'idle') {
          this.#clearState()
          return
        }
        const initialize = this.#state.state === 'idle'
        this.#state = state
        this.#mitt.emit('identityUpdated', this.publicIdentity)
        this.#mitt.emit('keychainUpdated', null)
        if (initialize) {
          this.sodium.ready
            .then(() => this.#loadKeychain())
            .then(() => {
              this.#startMessagePolling()
              return this.#processIncomingSharedKeys()
            })
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

  public async signup(userId: string, personalKey: Uint8Array) {
    await this.sodium.ready
    if (this.#state.state !== 'idle') {
      throw new Error(
        'Please log out of your current account before signing up for another one'
      )
    }
    const identity: Identity = {
      userId,
      sharing: generateBoxKeyPair(this.sodium),
      signature: generateSignatureKeyPair(this.sodium),
    }
    const withPersonalKey: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: personalKey,
    }
    const body: SignupRequestBody = {
      userId,
      signaturePublicKey: this.encode(identity.signature.publicKey),
      sharingPublicKey: this.encode(identity.sharing.publicKey),
      signaturePrivateKey: encrypt(
        this.sodium,
        identity.signature.privateKey,
        withPersonalKey,
        'base64'
      ),
      sharingPrivateKey: encrypt(
        this.sodium,
        identity.sharing.privateKey,
        withPersonalKey,
        'base64'
      ),
    }
    this.#state = {
      state: 'loaded',
      identity,
      personalKey,
      keychain: new Map(),
    }
    try {
      await this.#apiCall('POST', '/v1/signup', body)
      this.#startMessagePolling()
      this.#mitt.emit('identityUpdated', this.publicIdentity)
      this.#sync.setState(this.#state)
      return this.publicIdentity
    } catch (error) {
      this.#clearState() // Cleanup on failure
      throw error
    }
  }

  public async login(userId: string, personalKey: Uint8Array) {
    await this.sodium.ready
    this.#clearState()
    const res = await fetch(`${this.config.serverURL}/v1/login`, {
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'origin',
      headers: {
        'content-type': 'application/json',
        'x-e2esdk-user-id': userId,
        'x-e2esdk-timestamp': new Date().toISOString(),
      },
    })
    // todo: Error handling
    // todo: Verify server response AFTER parsing body (requires refactor)
    const responseBody = loginResponseBody.parse(await res.json())
    const withPersonalKey: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: personalKey,
    }
    const identity: Identity = {
      userId,
      signature: {
        publicKey: this.decode(responseBody.signaturePublicKey),
        privateKey: decrypt(
          this.sodium,
          responseBody.signaturePrivateKey,
          withPersonalKey,
          'base64'
        ),
      },
      sharing: {
        publicKey: this.decode(responseBody.sharingPublicKey),
        privateKey: decrypt(
          this.sodium,
          responseBody.sharingPrivateKey,
          withPersonalKey,
          'base64'
        ),
      },
    }
    if (
      !checkSignaturePublicKey(
        this.sodium,
        identity.signature.publicKey,
        identity.signature.privateKey
      )
    ) {
      throw new Error('Invalid signature key pair')
    }
    if (
      !checkEncryptionPublicKey(
        this.sodium,
        identity.sharing.publicKey,
        identity.sharing.privateKey
      )
    ) {
      throw new Error('Invalid sharing key pair')
    }
    this.#startMessagePolling()
    this.#state = {
      state: 'loaded',
      identity,
      personalKey,
      keychain: new Map(),
    }
    // Load keychain & incoming shared keys in the background
    this.#loadKeychain().catch(console.error)
    this.#processIncomingSharedKeys().catch(console.error)
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
    const withPersonalKey = this.#usePersonalKey()
    const payloadFingerprint = fingerprint(this.sodium, serializedCipher)
    const createdAtISO = createdAt.toISOString()
    const expiresAtISO = expiresAt?.toISOString() ?? null
    const body: PostKeychainItemRequestBody = {
      ownerId: this.#state.identity.userId,
      sharedBy,
      createdAt: createdAtISO,
      expiresAt: expiresAtISO,
      name: encrypt(
        this.sodium,
        name,
        withPersonalKey,
        encodedCiphertextFormatV1
      ),
      payload: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        withPersonalKey,
        encodedCiphertextFormatV1
      ),
      nameFingerprint,
      payloadFingerprint,
      signature: this.encode(
        signHash(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(sharedBy ?? ''),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
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
        signHash(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(to.userId),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
          this.decode(nameFingerprint),
          this.decode(payloadFingerprint),
          this.#state.identity.sharing.publicKey,
          this.#state.identity.signature.publicKey
        )
      ),
    }
    return this.#apiCall('POST', '/v1/shared-keys', body)
  }

  public async getOutgoingSharedKeys() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    return this.#apiCall<GetSharedKeysResponseBody>(
      'GET',
      '/v1/shared-keys/outgoing'
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
    return this.#encodeIdentity({
      userId: this.#state.identity.userId,
      sharingPublicKey: this.#state.identity.sharing.publicKey,
      signaturePublicKey: this.#state.identity.signature.publicKey,
    })
  }

  public async getUserIdentity(
    userId: string
  ): Promise<PublicUserIdentity | null> {
    await this.sodium.ready
    try {
      const res = await this.#apiCall<GetSingleIdentityResponseBody>(
        'GET',
        `/v1/identity/${userId}`
      )
      if (!res) {
        return null
      }
      if (res.userId !== userId) {
        throw new Error('Mismatching user IDs')
      }
      return res
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
      return this.#apiCall<GetMultipleIdentitiesResponseBody>(
        'GET',
        `/v1/identities/${userIds.join(',')}`
      )
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
      return this.#apiCall<GetParticipantsResponseBody>(
        'GET',
        `/v1/participants/${nameFingerprint}/${payloadFingerprint}`
      )
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

  async #loadKeychain() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account must be unlocked before calling API')
    }
    const res = await this.#apiCall<GetKeychainResponseBody>(
      'GET',
      '/v1/keychain'
    )
    const withPersonalKey = this.#usePersonalKey()
    for (const lockedItem of res) {
      if (lockedItem.ownerId !== this.#state.identity.userId) {
        console.warn('Got a key belonging to someone else', lockedItem)
        continue
      }
      if (
        !verifySignedHash(
          this.sodium,
          this.#state.identity.signature.publicKey,
          this.decode(lockedItem.signature),
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(lockedItem.sharedBy ?? ''),
          this.sodium.from_string(lockedItem.createdAt),
          this.sodium.from_string(lockedItem.expiresAt ?? ''),
          this.sodium.from_base64(lockedItem.nameFingerprint),
          this.sodium.from_base64(lockedItem.payloadFingerprint)
        )
      ) {
        console.warn('Invalid keychain entry detected:', lockedItem)
        continue
      }
      // todo: Decryption error handling
      const item: KeychainItem = {
        name: stringSchema.parse(
          decrypt(
            this.sodium,
            lockedItem.name,
            withPersonalKey,
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
                  withPersonalKey,
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
      addToKeychain(this.#state.keychain, item)
      this.#mitt.emit('keychainUpdated', null)
      this.#sync.setState(this.#state)
    }
  }

  async #processIncomingSharedKeys() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      console.error('Account must be unlocked before receiving keys')
      return
    }
    let sharedKeys: GetSharedKeysResponseBody = []
    try {
      sharedKeys = await this.#apiCall<GetSharedKeysResponseBody>(
        'GET',
        '/v1/shared-keys/incoming'
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
          !verifySignedHash(
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
            this.decode(sharedKey.fromSignaturePublicKey)
          )
        ) {
          throw new Error('Invalid shared key signature')
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

  #startMessagePolling() {
    clearInterval(this.#pollingHandle)
    this.#pollingHandle = setInterval(
      this.#processIncomingSharedKeys.bind(this),
      this.config.pollingInterval
    )
  }

  // API Layer --

  async #apiCall<ResponseType>(
    method: 'GET' | 'DELETE',
    path: string
  ): Promise<ResponseType>

  async #apiCall<BodyType, ReponseType>(
    method: 'POST',
    path: string,
    body: BodyType
  ): Promise<ResponseType>

  async #apiCall<BodyType, ResponseType>(
    method: HTTPMethod,
    path: string,
    body?: BodyType
  ): Promise<ResponseType> {
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
        'x-e2esdk-timestamp': timestamp,
        'x-e2esdk-signature': signature,
      },
      body: json,
    })
    if (!res.ok) {
      const { error: statusText, statusCode, message } = await res.json()
      throw new APIError(statusCode, statusText, message)
    }
    return this.#verifyServerResponse<ResponseType>(
      method,
      res,
      this.#state.identity
    )
  }

  async #verifyServerResponse<Output>(
    method: HTTPMethod,
    res: Response,
    identity: Identity
  ): Promise<Output> {
    const now = Date.now()
    const signature = res.headers.get('x-e2esdk-signature')
    if (!signature) {
      throw new Error('Missing server response signature')
    }
    const timestamp = res.headers.get('x-e2esdk-timestamp')
    if (!timestamp) {
      throw new Error('Missing server response timestamp')
    }
    const userId = res.headers.get('x-e2esdk-user-id') ?? undefined
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
      }
    )
    if (!verified) {
      throw new Error('Invalid server response signature')
    }
    if (userId && userId !== identity.userId) {
      throw new Error('Mismatching user ID')
    }
    if (isFarFromCurrentTime(timestamp, now)) {
      throw new Error(
        'Invalid server response timestamp (too far off current time)'
      )
    }
    return body ? JSON.parse(body) : undefined
  }

  // --

  #usePersonalKey(): SecretBoxCipher {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    return {
      algorithm: 'secretBox',
      key: this.#state.personalKey,
    }
  }

  #encodeIdentity(
    identity: PublicUserIdentity<Key>
  ): PublicUserIdentity<string> {
    return {
      userId: identity.userId,
      sharingPublicKey: this.encode(identity.sharingPublicKey),
      signaturePublicKey: this.encode(identity.signaturePublicKey),
    }
  }

  // Persistance & cross-tab communication --

  #clearState() {
    clearTimeout(this.#pollingHandle)
    this.#pollingHandle = undefined
    if (this.#state.state !== 'loaded') {
      return
    }
    this.sodium.memzero(this.#state.personalKey)
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
      this.#startMessagePolling()
    }
    if (document.visibilityState === 'hidden') {
      clearTimeout(this.#pollingHandle)
      this.#pollingHandle = undefined
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
      sharing: {
        publicKey: base64UrlEncode(state.identity.sharing.publicKey),
        privateKey: base64UrlEncode(state.identity.sharing.privateKey),
      },
      signature: {
        publicKey: base64UrlEncode(state.identity.signature.publicKey),
        privateKey: base64UrlEncode(state.identity.signature.privateKey),
      },
    },
    personalKey: base64UrlEncode(state.personalKey),
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
