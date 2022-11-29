import {
  fingerprintSchema,
  GetKeychainResponseBody,
  GetMultipleIdentitiesResponseBody,
  GetParticipantsResponseBody,
  GetSharedKeysResponseBody,
  GetSingleIdentityResponseBody,
  identitySchema as apiIdentitySchema,
  permissionFlags,
  PermissionFlags,
  PostBanRequestBody,
  PostKeychainItemRequestBody,
  PostPermissionRequestBody,
  PostSharedKeyBody,
  signedHashSchema,
  SignupRequestBody,
  sixtyFourBytesBase64Schema,
  thirtyTwoBytesBase64Schema,
  timestampSchema,
} from '@e2esdk/api'
import type { Optional } from '@e2esdk/core'
import { isFarFromCurrentTime } from '@e2esdk/core'
import {
  base64UrlDecode,
  base64UrlEncode,
  BoxCipher,
  Cipher,
  cipherParser,
  CIPHER_MAX_PADDED_LENGTH,
  decrypt,
  deriveClientIdentity,
  encodedCiphertextFormatV1,
  encrypt,
  EncryptableJSONDataType,
  fingerprint,
  memzeroCipher,
  randomPad,
  SecretBoxCipher,
  serializeCipher,
  signAuth as signClientRequest,
  signHash,
  Sodium,
  sodium,
  verifyAuth as verifyServerSignature,
  verifyClientIdentity,
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

type Config = Omit<ClientConfig<Uint8Array>, 'pollingInterval'> &
  Required<Pick<ClientConfig<Uint8Array>, 'pollingInterval'>>

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
  personalKey: key32Schema,
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
            .then(this.#startMessagePolling.bind(this))
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
    const body: SignupRequestBody = {
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
      .then(() => this.#startMessagePolling())
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
          this.#state.identity.signature.publicKey,
          this.decode(this.#state.identity.proof)
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
      const identity = await this.#apiCall<GetSingleIdentityResponseBody>(
        'GET',
        `/v1/identity/${userId}`
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
      const identities = await this.#apiCall<GetMultipleIdentitiesResponseBody>(
        'GET',
        `/v1/identities/${userIds.join(',')}`
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
      const participants = await this.#apiCall<GetParticipantsResponseBody>(
        'GET',
        `/v1/participants/${nameFingerprint}/${payloadFingerprint}`
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
    const res = await this.#apiCall<GetKeychainResponseBody>(
      'GET',
      '/v1/keychain'
    )
    const withPersonalKey = this.#usePersonalKey()
    const keychain = new Map<string, KeychainItem[]>()
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
      key: this.#state.identity.personalKey,
    }
  }

  // Persistance & cross-tab communication --

  #clearState() {
    clearTimeout(this.#pollingHandle)
    this.#pollingHandle = undefined
    if (this.#state.state !== 'loaded') {
      return
    }
    this.sodium.memzero(this.#state.identity.personalKey)
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
      personalKey: base64UrlEncode(state.identity.personalKey),
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
