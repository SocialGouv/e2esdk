import initOpaqueClient, { Login, Registration } from '@47ng/opaque-client'
import { wasmBase64 as opaqueWasm } from '@47ng/opaque-client/inline-wasm'
import {
  base64Bytes,
  decodeDeviceRegistrationURI,
  deviceEnrolledResponse,
  DeviceEnrollmentRecord,
  deviceEnrollmentResponse,
  deviceIdSchema,
  deviceSchema,
  encodeDeviceRegistrationURI,
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
  listDevicesResponseBody,
  LoginFinal,
  loginFinalResponse,
  LoginRequest,
  loginResponse as loginResponseSchema,
  Optional,
  permissionFlags,
  PermissionFlags,
  PostBanRequestBody,
  PostKeychainItemRequestBody,
  PostPermissionRequestBody,
  PostSharedKeyBody,
  responseHeaders,
  signatureSchema,
  signupCompleteResponse,
  SignupRecord,
  signupResponse,
  sixtyFourBytesBase64Schema,
  thirtyTwoBytesBase64Schema,
  timestampSchema,
  WebSocketNotificationTypes,
  websocketNotificationTypesSchema,
} from '@socialgouv/e2esdk-api'
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
  EncryptedFormSubmission,
  fingerprint,
  generateSealedBoxCipher,
  generateSecretBoxCipher,
  getDeviceLabelCipher,
  getOpaqueExportCipher,
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
} from '@socialgouv/e2esdk-crypto'
import { LocalStateSync } from 'local-state-sync'
import mitt, { Emitter } from 'mitt'
import secureJSON from 'secure-json-parse'
import { z } from 'zod'

export type ClientConfig<KeyType = string> = {
  serverURL: string
  serverPublicKey: KeyType // todo: Make this an array to allow server key rotation
  handleNotifications?: boolean
  handleSessionRefresh?: boolean
}

type Config = Required<ClientConfig<Uint8Array>> & {
  clientId: string
}

// --

const SESSION_REFRESH_RETRY_COUNT = 3

const NAME_PREFIX_LENGTH_BYTES = 32
const NAME_PREFIX_SEPARATOR = ':'
const NAME_PREFIX_LENGTH_CHARS =
  NAME_PREFIX_SEPARATOR.length + Math.round((NAME_PREFIX_LENGTH_BYTES * 4) / 3)

const nameSchema = z.string().regex(/^[\w-]{43}:/)
const serializedCipherSchema = z.string()

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
    .transform(input => cipherParser.parse(secureJSON.parse(input.trim()))),
  createdAt: timestampSchema.transform(value => new Date(value)),
  expiresAt: timestampSchema.transform(value => new Date(value)).nullable(),
  sharedBy: apiIdentitySchema.shape.userId.nullable(),
})

type KeychainItem = z.infer<typeof keychainItemSchema>

export type KeychainItemMetadata = Pick<
  KeychainItem,
  | 'nameFingerprint'
  | 'payloadFingerprint'
  | 'createdAt'
  | 'expiresAt'
  | 'sharedBy'
> & {
  algorithm: Cipher['algorithm']
  publicKey?: string
  label: string
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
  proof: signatureSchema,
})

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
  deviceId: deviceIdSchema,
  sessionId: fingerprintSchema,
  exportKey: base64Bytes(64).transform(base64UrlDecode),
})

const stateSchema = z.discriminatedUnion('state', [
  idleStateSchema,
  loadedStateSchema,
])

type State = z.infer<typeof stateSchema>

// --

const deviceSecretSchema = base64Bytes(32)

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
  #socketExponentialBackoffTimeout?: number
  #sessionRefreshRetryCount: number

  constructor(config: ClientConfig) {
    const tick = performance.now()
    initOpaqueClient(base64UrlDecode(opaqueWasm)).then(() =>
      console.log(`OPAQUE initialized in ${performance.now() - tick} ms`)
    )
    this.sodium = sodium
    this.config = Object.freeze({
      serverURL: config.serverURL,
      serverPublicKey: this.decode(config.serverPublicKey),
      handleNotifications: config.handleNotifications ?? true,
      handleSessionRefresh: config.handleSessionRefresh ?? true,
      clientId:
        typeof crypto === 'object'
          ? crypto.randomUUID()
          : 'not-available-in-ssr',
    })
    this.#sessionRefreshRetryCount = this.config.handleSessionRefresh
      ? SESSION_REFRESH_RETRY_COUNT
      : 0
    this.#state = {
      state: 'idle',
    }
    this.#mitt = mitt()
    this.#sync = new LocalStateSync({
      encryptionKey: 'e2esdk-client-localStateSync-encryptionKey8',
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

  public async signup(userId: string) {
    await this.sodium.ready
    if (this.#state.state !== 'idle') {
      throw new Error(
        'Please log out of your current account before signing up for another one'
      )
    }
    try {
      const mainKey = this.sodium.randombytes_buf(32)
      const identity = deriveClientIdentity(this.sodium, userId, mainKey)
      const deviceSecret = this.sodium.randombytes_buf(32, 'base64')
      const opaqueRegistration = new Registration()
      const registrationRequest = base64UrlEncode(
        opaqueRegistration.start(deviceSecret)
      )
      const res1 = await fetch(
        `${this.config.serverURL}/v1/auth/signup/request`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-e2esdk-client-id': this.config.clientId,
          },
          body: JSON.stringify({
            userId,
            registrationRequest,
          }),
        }
      )
      const { nonce, registrationResponse } = signupResponse.parse(
        await res1.json()
      )
      const registrationRecord = base64UrlEncode(
        opaqueRegistration.finish(
          deviceSecret,
          this.decode(registrationResponse)
        )
      )
      const mainKeyWrappingCipher = getOpaqueExportCipher(
        this.sodium,
        opaqueRegistration.getExportKey()
      )
      const signupRecordBody: SignupRecord = {
        nonce,
        registrationRecord,
        wrappedMainKey: encrypt(
          this.sodium,
          mainKey,
          mainKeyWrappingCipher,
          // Bind the ciphertext to the userId as authenticated additional data
          sodium.from_string(userId),
          'application/e2esdk.ciphertext.v1'
        ),
        signaturePublicKey: base64UrlEncode(identity.signature.publicKey),
        sharingPublicKey: base64UrlEncode(identity.sharing.publicKey),
        proof: identity.proof,
      }
      this.sodium.memzero(mainKey)
      this.sodium.memzero(mainKeyWrappingCipher.key)
      const res2 = await fetch(
        `${this.config.serverURL}/v1/auth/signup/record`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-e2esdk-client-id': this.config.clientId,
          },
          body: JSON.stringify(signupRecordBody),
        }
      )
      const { deviceId } = signupCompleteResponse.parse(await res2.json())
      this.registerEnrolledDevice(
        encodeDeviceRegistrationURI(userId, deviceId, deviceSecret)
      )
    } catch (error) {
      this.#clearState() // Cleanup on failure
      throw error
    }
  }

  public async login(userId: string) {
    await this.sodium.ready
    // this.#clearState()
    const deviceId = localStorage.getItem(`e2esdk:${userId}:device:id`)
    const deviceSecret = localStorage.getItem(`e2esdk:${userId}:device:secret`)
    if (!deviceId || !deviceSecret) {
      throw new Error('Device is not enrolled for this user')
    }
    const opaqueLogin = new Login()
    const loginRequestBody: LoginRequest = {
      userId,
      deviceId,
      loginRequest: base64UrlEncode(opaqueLogin.start(deviceSecret)),
    }
    const res1 = await fetch(`${this.config.serverURL}/v1/auth/login/request`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-e2esdk-client-id': this.config.clientId,
        'x-e2esdk-device-id': deviceId,
      },
      body: JSON.stringify(loginRequestBody),
    })
    const { nonce, loginResponse } = loginResponseSchema.parse(
      await res1.json()
    )
    const loginFinalBody: LoginFinal = {
      nonce,
      loginFinal: base64UrlEncode(
        opaqueLogin.finish(deviceSecret, this.decode(loginResponse))
      ),
    }
    const res2 = await fetch(`${this.config.serverURL}/v1/auth/login/final`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-e2esdk-client-id': this.config.clientId,
        'x-e2esdk-device-id': deviceId,
      },
      body: JSON.stringify(loginFinalBody),
    })
    const sessionKey = opaqueLogin.getSessionKey()
    const sessionId = fingerprint(this.sodium, sessionKey)
    this.sodium.memzero(sessionKey)
    const { wrappedMainKey } = loginFinalResponse.parse(await res2.json())
    const exportKey = opaqueLogin.getExportKey()
    const mainKeyWrappingCipher = getOpaqueExportCipher(this.sodium, exportKey)
    const mainKey = z
      .instanceof(Uint8Array)
      .parse(
        decrypt(
          this.sodium,
          wrappedMainKey,
          mainKeyWrappingCipher,
          this.sodium.from_string(userId)
        )
      )
    const identity = deriveClientIdentity(this.sodium, userId, mainKey)
    this.sodium.memzero(mainKey)
    this.sodium.memzero(mainKeyWrappingCipher.key)
    this.#state = {
      state: 'loaded',
      identity,
      keychain: new Map(),
      deviceId,
      sessionId,
      exportKey: opaqueLogin.getExportKey(),
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
    // todo: Do an API call to revoke the sessionId
    this.#clearState()
    this.#sync.setState(this.#state)
  }

  // Devices --

  public async enrollNewDevice(label?: string) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account locked: cannot enroll new device')
    }
    // First, fetch and unwrap the main key as the current device
    const mainKeyUnwrappingCipher = getOpaqueExportCipher(
      this.sodium,
      this.#state.exportKey
    )
    const device = deviceSchema.parse(
      await this.#apiCall('GET', `/v1/auth/devices/${this.#state.deviceId}`)
    )
    const mainKey = z
      .instanceof(Uint8Array)
      .parse(
        decrypt(
          this.sodium,
          device.wrappedMainKey,
          mainKeyUnwrappingCipher,
          this.sodium.from_string(this.#state.identity.userId)
        )
      )
    this.sodium.memzero(mainKeyUnwrappingCipher.key)

    // Verify that the identity derived from the unwrapped main key
    // matches the one we're currently using
    const identity = deriveClientIdentity(
      this.sodium,
      this.#state.identity.userId,
      mainKey
    )
    const identityMatch =
      this.sodium.memcmp(
        identity.signature.privateKey,
        this.#state.identity.signature.privateKey
      ) &&
      this.sodium.memcmp(
        identity.sharing.privateKey,
        this.#state.identity.sharing.privateKey
      ) &&
      this.sodium.memcmp(
        identity.keychainBaseKey,
        this.#state.identity.keychainBaseKey
      ) &&
      identity.proof === this.#state.identity.proof

    if (!identityMatch) {
      throw new Error('Identity mismatch')
    }

    // Next, prepare enrollment (OPAQUE registration + main key wrapping)
    const deviceSecret = this.sodium.randombytes_buf(32, 'base64')
    const enroll = new Registration()
    const deviceEnrollmentRequest = base64UrlEncode(enroll.start(deviceSecret))
    const { registrationResponse, nonce } = deviceEnrollmentResponse.parse(
      await this.#apiCall('POST', '/v1/auth/devices/enrollment/request', {
        registrationRequest: deviceEnrollmentRequest,
      })
    )
    const registrationRecord = base64UrlEncode(
      enroll.finish(deviceSecret, base64UrlDecode(registrationResponse))
    )
    const mainKeyRewrappingCipher = getOpaqueExportCipher(
      this.sodium,
      enroll.getExportKey()
    )
    enroll.free()
    const wrappedMainKey = encrypt(
      this.sodium,
      mainKey,
      mainKeyRewrappingCipher,
      this.sodium.from_string(this.#state.identity.userId),
      'application/e2esdk.ciphertext.v1'
    )
    this.sodium.memzero(mainKey)
    this.sodium.memzero(mainKeyRewrappingCipher.key)
    const labelCipher = getDeviceLabelCipher(
      this.sodium,
      this.#state.identity.userId,
      this.#state.identity.keychainBaseKey
    )
    const deviceLabel = label
      ? encrypt(
          this.sodium,
          label,
          labelCipher,
          null,
          'application/e2esdk.ciphertext.v1'
        )
      : undefined
    this.sodium.memzero(labelCipher.key)
    const deviceEnrollmentRecord: DeviceEnrollmentRecord = {
      nonce,
      deviceLabel,
      registrationRecord,
      wrappedMainKey,
    }
    const { deviceId } = deviceEnrolledResponse.parse(
      await this.#apiCall(
        'POST',
        '/v1/auth/devices/enrollment/record',
        deviceEnrollmentRecord
      )
    )
    // Return this URI to the caller so they may transmit it securely
    // (ideally offline via a QR code) to the newly enrolled device
    return encodeDeviceRegistrationURI(
      this.#state.identity.userId,
      deviceId,
      deviceSecret
    )
  }

  /**
   * Register this device and login
   * @param uri device registration URI
   */
  public async registerEnrolledDevice(uri: string) {
    const { userId, deviceId, deviceSecret } = decodeDeviceRegistrationURI(uri)
    localStorage.setItem(`e2esdk:${userId}:device:id`, deviceId)
    localStorage.setItem(`e2esdk:${userId}:device:secret`, deviceSecret)
    try {
      return await this.login(userId)
    } catch (error) {
      // Cleanup on error
      localStorage.removeItem(`e2esdk:${userId}:device:id`)
      localStorage.removeItem(`e2esdk:${userId}:device:secret`)
      throw error
    }
  }

  public get currentDeviceId() {
    if (this.#state.state !== 'loaded') {
      return null
    }
    return this.#state.deviceId
  }

  public async getEnrolledDevices() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account locked: cannot list enrolled devices')
    }
    const devices = listDevicesResponseBody.parse(
      await this.#apiCall('GET', '/v1/auth/devices')
    )
    const deviceLabelCipher = getDeviceLabelCipher(
      this.sodium,
      this.#state.identity.userId,
      this.#state.identity.keychainBaseKey
    )
    try {
      return devices.map(device => ({
        ...device,
        label: device.label
          ? z
              .string()
              .parse(decrypt(this.sodium, device.label, deviceLabelCipher))
          : undefined,
      }))
    } finally {
      this.sodium.memzero(deviceLabelCipher.key)
    }
  }

  // Key Ops --

  public async createKey(
    label: string,
    algorithm: 'secretBox' | 'sealedBox',
    expiresAt?: Date
  ) {
    await this.sodium.ready
    const cipher =
      algorithm === 'sealedBox'
        ? generateSealedBoxCipher(this.sodium)
        : generateSecretBoxCipher(this.sodium)
    const prefix = this.sodium.randombytes_buf(
      NAME_PREFIX_LENGTH_BYTES,
      'base64'
    )
    const name = `${prefix}${NAME_PREFIX_SEPARATOR}${label}`
    return this.#addKey({
      name,
      cipher,
      createdAt: new Date(),
      expiresAt,
      sharedBy: null,
    })
  }

  public async rotateKey(nameFingerprint: string, expiresAt?: Date) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    if (!this.#state.keychain.has(nameFingerprint)) {
      throw new Error('Cannot rotate key: no previous key found in keychain')
    }
    const [existingKey] = this.#state.keychain.get(nameFingerprint)!
    const cipher =
      existingKey.cipher.algorithm === 'sealedBox'
        ? generateSealedBoxCipher(this.sodium)
        : existingKey.cipher.algorithm === 'secretBox'
        ? generateSecretBoxCipher(this.sodium)
        : (() => {
            throw new Error('Unsupported algorithm')
          })()
    return this.#addKey({
      name: existingKey.name,
      cipher,
      expiresAt,
      createdAt: new Date(),
      sharedBy: null,
    })
  }

  async #addKey({
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
      name: encrypt(
        this.sodium,
        name,
        nameCipher,
        null,
        encodedCiphertextFormatV1
      ),
      payload: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        payloadCipher,
        null,
        encodedCiphertextFormatV1
      ),
      nameFingerprint,
      payloadFingerprint,
      signature: base64UrlEncode(
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
      label: name.slice(NAME_PREFIX_LENGTH_CHARS),
      nameFingerprint,
      payloadFingerprint,
      algorithm: cipher.algorithm,
      publicKey:
        cipher.algorithm !== 'secretBox'
          ? base64UrlEncode(cipher.publicKey)
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

  public findKeyByNameFingerprint(nameFingerprint: string) {
    if (this.#state.state !== 'loaded') {
      return undefined
    }
    const keys = this.#state.keychain.get(nameFingerprint)
    return keys ? getKeychainItemMetadata(keys[0]) : undefined
  }

  public findKeyByLabel(label: string) {
    if (this.#state.state !== 'loaded') {
      return undefined
    }

    const keys = Array.from(this.#state.keychain.values()).find(
      keys => keys[0].name.slice(NAME_PREFIX_LENGTH_CHARS) === label
    )
    return keys ? getKeychainItemMetadata(keys[0]) : undefined
  }

  public async deleteKey(nameFingerprint: string, payloadFingerprint: string) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    const keys = this.#state.keychain.get(nameFingerprint)
    if (!keys || keys.length === 0) {
      throw new Error(
        `No available key to delete with fingerprint ${nameFingerprint}`
      )
    }
    // First, delete locally
    this.#state.keychain.set(
      nameFingerprint,
      keys.filter(key => key.payloadFingerprint !== payloadFingerprint)
    )
    this.#mitt.emit('keychainUpdated', null)

    // Then delete on the server
    const url = `/v1/keychain/${nameFingerprint}/${payloadFingerprint}`
    await this.#apiCall('DELETE', url)

    // This should trigger a WebSocket notification which will
    // force reloading the keychain from the server, if we're online.
    // By deleting locally first, we prevent race conditions.
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
      fromSharingPublicKey: base64UrlEncode(
        this.#state.identity.sharing.publicKey
      ),
      fromSignaturePublicKey: base64UrlEncode(
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
        null,
        encodedCiphertextFormatV1
      ),
      payload: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        sendTo,
        null,
        encodedCiphertextFormatV1
      ),
      nameFingerprint,
      payloadFingerprint,
      signature: base64UrlEncode(
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

  public get publicIdentity(): PublicUserIdentity | null {
    if (this.#state.state !== 'loaded') {
      return null
    }
    return {
      userId: this.#state.identity.userId,
      sharingPublicKey: base64UrlEncode(this.#state.identity.sharing.publicKey),
      signaturePublicKey: base64UrlEncode(
        this.#state.identity.signature.publicKey
      ),
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

  public encrypt<DataType>(
    input: DataType,
    nameFingerprint: string,
    additionalData?: string | Uint8Array
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
      additionalData
        ? typeof additionalData === 'string'
          ? this.sodium.from_string(additionalData)
          : additionalData
        : null,
      encodedCiphertextFormatV1
    )
  }

  public decrypt(
    ciphertext: string,
    nameFingerpint: string,
    additionalData?: string | Uint8Array
  ) {
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
          additionalData
            ? typeof additionalData === 'string'
              ? this.sodium.from_string(additionalData)
              : additionalData
            : null
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

  // Signature --

  public sign(...items: string[]) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked: cannot sign')
    }
    const signature = multipartSignature(
      this.sodium,
      this.#state.identity.signature.privateKey,
      ...items.map(str => this.sodium.from_string(str))
    )
    return base64UrlEncode(signature)
  }

  public verifySignature(
    signature: string,
    publicKey: string | Uint8Array,
    ...items: string[]
  ) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked: cannot verify signature')
    }
    const pk =
      typeof publicKey === 'string' ? this.decode(publicKey) : publicKey
    return verifyMultipartSignature(
      this.sodium,
      pk,
      this.decode(signature),
      ...items.map(str => this.sodium.from_string(str))
    )
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
      sharingPublicKey: base64UrlEncode(this.#state.identity.sharing.publicKey),
      signaturePublicKey: base64UrlEncode(
        this.#state.identity.signature.publicKey
      ),
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
        name: nameSchema.parse(
          decrypt(this.sodium, lockedItem.name, nameCipher)
        ),
        nameFingerprint: lockedItem.nameFingerprint,
        payloadFingerprint: lockedItem.payloadFingerprint,
        cipher: cipherParser.parse(
          secureJSON.parse(
            serializedCipherSchema
              .parse(decrypt(this.sodium, lockedItem.payload, payloadCipher))
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
      if (item.cipher.algorithm === 'sealedBox') {
        // Check we have a matching key pair
        const derivedPublicKey = this.sodium.crypto_scalarmult_base(
          item.cipher.privateKey
        )
        if (!this.sodium.memcmp(derivedPublicKey, item.cipher.publicKey)) {
          console.warn('Mismatching public/private key', lockedItem)
          continue
        }
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
          name: nameSchema.parse(
            decrypt(this.sodium, sharedKey.name, withSharedSecret)
          ),
          nameFingerprint: sharedKey.nameFingerprint,
          payloadFingerprint: sharedKey.payloadFingerprint,
          cipher: cipherParser.parse(
            secureJSON.parse(
              serializedCipherSchema
                .parse(
                  decrypt(this.sodium, sharedKey.payload, withSharedSecret)
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
        await this.#addKey(item)
        this.#mitt.emit('keyReceived', getKeychainItemMetadata(item))
      } catch (error) {
        console.error(error)
        continue
      }
    }
  }

  async #startWebSocket(context: string) {
    if (this.#state.state !== 'loaded') {
      return
    }
    await this.sodium.ready
    if (!this.config.handleNotifications) {
      // This is the case for clients managed by Devtools,
      // we assume that there is another client running for
      // the application that will (by default) handle notifications.
      // Having more than one of them react to notifications risks
      // data races in processing incoming shared keys.
      return
    }
    if (this.#socket && this.#socket.readyState !== WebSocket.CLOSED) {
      // WebSocket is already connected
      return
    }
    // WebSocket upgrade authentication is done via querystring,
    // as we cannot set custom headers on the underlying HTTP request.
    // See packages/server/src/routes/notifications.ts
    const timestamp = new Date().toISOString()
    const url = new URL('/v1/notifications', this.config.serverURL)
    url.protocol = url.protocol.replace('http', 'ws')
    url.searchParams.set('context', context)
    url.searchParams.set('x-e2esdk-user-id', this.#state.identity.userId)
    url.searchParams.set('x-e2esdk-client-id', this.config.clientId)
    url.searchParams.set('x-e2esdk-device-id', this.#state.deviceId)
    url.searchParams.set('x-e2esdk-session-id', this.#state.sessionId)
    url.searchParams.set('x-e2esdk-timestamp', timestamp)
    const signature = signClientRequest(
      this.sodium,
      this.#state.identity.signature.privateKey,
      {
        timestamp,
        method: 'GET',
        // Note that we sign the URL before applying the signature
        // into the querystring (otherwise we'd be running in circles),
        // so the server will do the same thing for verification.
        // See packages/server/src/plugins/auth.ts
        url: url.toString(),
        recipientPublicKey: this.config.serverPublicKey,
        userId: this.#state.identity.userId,
        clientId: this.config.clientId,
        deviceId: this.#state.deviceId,
        sessionId: this.#state.sessionId,
      }
    )
    url.searchParams.set('x-e2esdk-signature', signature)
    const socket = new WebSocket(url.toString())
    socket.addEventListener('message', event => {
      const res = websocketNotificationTypesSchema.safeParse(event.data)
      if (!res.success) {
        console.error(res.error)
        return
      }
      // By adding a random delay, we might help solve data races
      // between two clients configured to handle notifications.
      // One case where that might happen is when two windows are
      // open and visible (eg: on different screens or each on half of
      // a shared screen). It does not happen for tabs since the WebSocket
      // is closed when a tab becomes hidden.
      const randomDelay = Math.random() * 2000
      if (res.data === WebSocketNotificationTypes.keychainUpdated) {
        setTimeout(() => this.#loadKeychain().catch(console.error))
      }
      if (res.data === WebSocketNotificationTypes.sharedKeyAdded) {
        setTimeout(() => this.#processIncomingSharedKeys(), randomDelay)
      }
    })
    // Automatically reconnect with exponential backoff
    socket.addEventListener('close', event => {
      if (event.code === 4000) {
        // We closed the connection ourselves, bail out from autoreconnect
        return
      }
      this.#socketExponentialBackoffTimeout = Math.min(
        (this.#socketExponentialBackoffTimeout ?? 500) * 2,
        64000
      )
      setTimeout(() => {
        console.debug(
          '@socialgouv/e2esdk-client: WebSocket connection closed, attempting to reconnect...'
        )
        this.#startWebSocket('reconnect')
      }, this.#socketExponentialBackoffTimeout)
    })
    this.#socket = socket
  }

  #stopWebSocket(reason: string) {
    if (!this.#socket) {
      return
    }
    this.#socket.close(4000, reason)
    this.#socket = undefined
    this.#socketExponentialBackoffTimeout = undefined
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
    const signatureItems = {
      timestamp,
      method,
      url,
      body: json,
      recipientPublicKey: this.config.serverPublicKey,
      userId: this.#state.identity.userId,
      clientId: this.config.clientId,
      deviceId: this.#state.deviceId,
      sessionId: this.#state.sessionId,
    }
    const signature = signClientRequest(
      this.sodium,
      this.#state.identity.signature.privateKey,
      signatureItems
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
        'x-e2esdk-device-id': this.#state.deviceId,
        'x-e2esdk-session-id': this.#state.sessionId,
        'x-e2esdk-timestamp': timestamp,
        'x-e2esdk-signature': signature,
      },
      body: json,
    })
    if (!res.ok) {
      // Handle "Unauthorized" session refresh retries
      if (res.status === 401) {
        if (this.#sessionRefreshRetryCount === 0) {
          const { error: statusText, statusCode, message } = await res.json()
          throw new APIError(statusCode, statusText, message)
        }
        this.#sessionRefreshRetryCount--
        // Refresh session
        await this.login(this.#state.identity.userId)
        // Then try again
        // @ts-ignore (overload confusion)
        return this.#apiCall(method, path, body)
      } else {
        const { error: statusText, statusCode, message } = await res.json()
        throw new APIError(statusCode, statusText, message)
      }
    }
    this.#sessionRefreshRetryCount = this.config.handleSessionRefresh
      ? SESSION_REFRESH_RETRY_COUNT
      : 0
    return this.#verifyServerResponse(method, res)
  }

  async #verifyServerResponse(
    method: HTTPMethod,
    res: Response
  ): Promise<unknown> {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account must be loaded')
    }
    // todo: Refactor this to allow caching (drop timestamp signing)
    const now = Date.now()
    const { 'x-e2esdk-signature': signature, 'x-e2esdk-timestamp': timestamp } =
      responseHeaders.parse(Object.fromEntries(res.headers))
    // res.text() will return "" on empty bodies
    const body = (await res.text()) || undefined
    const signatureArgs = {
      timestamp,
      method,
      url: res.url,
      body,
      recipientPublicKey: this.#state.identity.signature.publicKey,
      userId: this.#state.identity.userId,
      clientId: this.config.clientId,
      deviceId: this.#state.deviceId,
      sessionId: this.#state.sessionId,
    }
    const verified = verifyServerSignature(
      this.sodium,
      this.config.serverPublicKey,
      signature,
      signatureArgs
    )
    if (!verified) {
      console.dir(signatureArgs)
      throw new Error('Invalid server response signature')
    }
    if (isFarFromCurrentTime(timestamp, now)) {
      throw new Error(
        'Invalid server response timestamp (too far off current time)'
      )
    }
    return body ? secureJSON.parse(body) : undefined
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
    this.#stopWebSocket('logout')
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
  const payload: z.input<typeof stateSchema> = {
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
    deviceId: state.deviceId,
    sessionId: state.sessionId,
    exportKey: base64UrlEncode(state.exportKey),
    keychain: Array.from(state.keychain.values())
      .flat()
      .map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt?.toISOString() ?? null,
        cipher: serializeCipher(item.cipher),
      })),
  }
  return JSON.stringify(payload)
}

function stateParser(input: string): State {
  const result = stateSchema.safeParse(secureJSON.parse(input))
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
    // Remove the 32 bytes base64-encoded plus separator `:`
    label: item.name.slice(NAME_PREFIX_LENGTH_CHARS),
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
