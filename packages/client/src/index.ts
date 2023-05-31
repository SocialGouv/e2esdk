import initOpaqueClient, { Login, Registration } from '@47ng/opaque-client'
import { wasmBase64 as opaqueWasm } from '@47ng/opaque-client/inline-wasm'
import {
  DeviceEnrollmentRecord,
  GetKeychainResponseBody,
  GetMultipleIdentitiesResponseBody,
  GetParticipantsResponseBody,
  GetSharedKeysResponseBody,
  GetSingleIdentityResponseBody,
  LoginFinal,
  LoginRequest,
  Optional,
  PermissionFlags,
  PostBanRequestBody,
  PostKeychainItemRequestBody,
  PostPermissionRequestBody,
  PostSharedKeyBody,
  SignupRecord,
  WebSocketNotificationTypes,
  identitySchema as apiIdentitySchema,
  base64Bytes,
  decodeDeviceRegistrationURI,
  deviceEnrolledResponse,
  deviceEnrollmentResponse,
  deviceIdSchema,
  deviceSchema,
  encodeDeviceRegistrationURI,
  fingerprintSchema,
  getKeychainResponseBody,
  getMultipleIdentitiesResponseBody,
  getParticipantsResponseBody,
  getSharedKeysResponseBody,
  getSingleIdentityResponseBody,
  isFarFromCurrentTime,
  listDevicesResponseBody,
  loginFinalResponse,
  loginResponse as loginResponseSchema,
  permissionFlags,
  responseHeaders,
  signatureSchema,
  signupCompleteResponse,
  signupResponse,
  sixtyFourBytesBase64Schema,
  thirtyTwoBytesBase64Schema,
  timestampSchema,
  websocketNotificationTypesSchema,
} from '@socialgouv/e2esdk-api'
import {
  BoxCipher,
  CIPHER_MAX_PADDED_LENGTH,
  Cipher,
  EncryptedFormSubmission,
  SecretBoxCipher,
  Sodium,
  base64UrlDecode,
  base64UrlEncode,
  cipherParser,
  decrypt,
  decryptFormData,
  deriveClientIdentity,
  encodedCiphertextFormatV1,
  encrypt,
  fingerprint,
  generateSealedBoxCipher,
  generateSecretBoxCipher,
  getDeviceLabelCipher,
  getOpaqueExportCipher,
  memzeroCipher,
  multipartSignature,
  numberToUint32LE,
  randomPad,
  serializeCipher,
  signAuth as signClientRequest,
  sodium,
  verifyClientIdentity,
  verifyMultipartSignature,
  verifyAuth as verifyServerSignature,
} from '@socialgouv/e2esdk-crypto'
import { LocalStateSync } from 'local-state-sync'
import mitt, { Emitter } from 'mitt'
import secureJSON from 'secure-json-parse'
import { z } from 'zod'

/**
 * Configuration object for the e2esdk client constructor
 */
export type ClientConfig<KeyType = string> = {
  /**
   * Fully qualified URL to the e2esdk server
   *
   * As found in the server's .env configuration, under `DEPLOYMENT_URL`.
   */
  serverURL: string

  /**
   * Serialised server signature public key
   *
   * As found in the server's .env configuration, under `SIGNATURE_PUBLIC_KEY`
   * This is used to establish mutual authentication of API calls,
   * so that the client can verify authenticity of responses coming
   * from the server, and detect MitM tampering.
   */
  serverSignaturePublicKey: KeyType // todo: Make this an array to allow server key rotation

  /**
   * Enable real-time sync with WebSockets for this instance
   *
   * This defaults to `true` for most cases where there is a single client
   * instance in the application.
   * Devtools have it set to false when creating their own client instance,
   * in order to avoid feedback loops when local-syncing with the main client.
   */
  handleNotifications?: boolean

  /**
   * Enable automatic re-authentication on 401 Unauthorized API responses
   *
   * The default auth session TTL is short-lived (1 hour), so re-authentication
   * is necessary, and can be automated using this flag.
   * Upon reception of a 401 response status code, the client will attempt to
   * login again to refresh its session, and retry the failed operation,
   * up to 3 times, after which an error will be thrown.
   *
   * This defaults to true, and should follow the value of `handleNotifications`:
   * true for one main client instance, and false for replicas.
   *
   * Devtools with their own client don't automatically re-authenticate on 401s.
   */
  handleSessionRefresh?: boolean
}

type Config = Required<ClientConfig<Uint8Array>> & {
  clientId: string
}

// --

const SESSION_REFRESH_RETRY_COUNT = 3

/**
 * Keychain name encoding: {prefix}{separator}{purpose}
 * Prefix is base64url-encoded.
 * Note: if changing anything in the format, remember to update the RegExp
 * in the keychainNameSchema parser below.
 * @see {@link `createNewKeychain`}
 */
const NAME_PREFIX_LENGTH_BYTES = 32
const NAME_PREFIX_SEPARATOR = ':'
const NAME_PREFIX_LENGTH_CHARS =
  NAME_PREFIX_SEPARATOR.length + Math.round((NAME_PREFIX_LENGTH_BYTES * 4) / 3)

const keychainNameSchema = z.string().regex(/^[\w-]{43}:/)
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
  keychainName: z.string(),
  keychainFingerprint: fingerprintSchema,
  keyFingerprint: fingerprintSchema,
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
  | 'keychainFingerprint'
  | 'keyFingerprint'
  | 'createdAt'
  | 'expiresAt'
  | 'sharedBy'
> & {
  algorithm: Cipher['algorithm']
  publicKey?: string
  purpose: string
}

// --

const keychainSchema = z.array(keychainItemSchema).transform(array =>
  array.reduce((map, item) => {
    map.set(
      item.keychainFingerprint,
      [...(map.get(item.keychainFingerprint) ?? []), item].sort(
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

/**
 * The main e2esdk client interface
 *
 * This performs all the cryptographic operations required to implement E2EE
 * in your application, along with a deployed server for persistance and
 * coordination with other clients.
 *
 * It requires a little configuration to connect it to a running e2esdk server,
 * and enable public-key based mutual authentication of API calls.
 *
 * Multiple clients instanciated on the same origin will sync their state:
 * a successfull login on one will enable the others to perform actions,
 * making multi-tab applications seamless.
 *
 * Clients react in real-time to server-sent events, and sync their keystore
 * automatically. You can subscribe to events using the .on() method.
 */
export class Client {
  public readonly sodium: Sodium
  public readonly config: Readonly<Config>
  #state: State
  #mitt: Emitter<Events>
  #sync: LocalStateSync<State>
  #socket?: WebSocket
  #socketExponentialBackoffTimeout?: number
  #sessionRefreshRetryCount: number

  /**
   * Create a new instance of the e2esdk client
   *
   * This operation is generally safe to perform on the server in SSR contexts,
   * however most other operations will require to run in a browser environment,
   * and require authentication.
   *
   * @param config Client configuration object
   */
  constructor(config: ClientConfig) {
    const tick = performance.now()
    initOpaqueClient(base64UrlDecode(opaqueWasm)).then(() =>
      console.debug(`OPAQUE initialized in ${performance.now() - tick} ms`)
    )
    this.sodium = sodium
    this.config = Object.freeze({
      serverURL: config.serverURL,
      serverSignaturePublicKey: base64UrlDecode(
        config.serverSignaturePublicKey
      ),
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
      namespace: [config.serverURL, config.serverSignaturePublicKey].join(':'),
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

  /**
   * Subscribe to events
   *
   * @param event the event name to subscribe to, see available {@link Events}
   * @param callback pass a callback function with the appropriate payload
   * @returns an unsubscribe function, to be called to stop listening
   *
   * Example:
   * ```ts
   * // Subscribe to identity changes:
   * const off = client.on('identityUpdated', identity => {
   *   if (identity) {
   *     console.log(identity.userId)
   *   } else {
   *     // logged out
   *   }
   * })
   * // Unsubscribe
   * off()
   * ```
   */
  public on<K extends keyof Events>(
    event: K,
    callback: (arg: Events[K]) => void
  ) {
    this.#mitt.on(event, callback)
    return () => this.#mitt.off(event, callback)
  }

  // Auth --

  /**
   * Create an identity on e2esdk
   *
   * @param userId a unique, immutable identifier for a user in the application.
   *   Ideally, this should be an automatically generated primary key in the
   *   application database, like a UUID.
   *
   * This will do a couple of things:
   * 1. Create an identity derived from a newly generated mainKey
   * 2. Register a device pre-enrolled to this account
   * 3. Persist those objects on the server
   *
   * Note that signup does not authenticate the user, you will need to call
   * the `login` method after a successful signup to establish an authenticated
   * session.
   */
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
          base64UrlDecode(registrationResponse)
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

  /**
   * Authenticate using the local enrolled device authentication
   *
   * @param userId The user ID used at registration (signup) time
   * @returns A Promise to the public user identity if the login succeeds,
   *   or null if it fails.
   *
   * It may seem weird that only the userId is required to authenticate,
   * but that's a side effect of using enrolled devices for access: the
   * actual credentials are stored on each device, the user ID is only a
   * way to handle multiple accounts on a single physical storage context
   * (eg: alice & bob sharing the same Firefox browser).
   *
   * When logging in, the device credentials will be retrieved from
   * local storage, and used to perform an OPAQUE authentication flow.
   * Out of that, the OPAQUE export key will be used to unwrap the
   * user account mainKey, from which the user identity will be derived.
   * The OPAQUE key agreement also defines the session ID.
   *
   * Once the client is hydrated with an identity and a session ID, it can
   * perform authenticated calls to the API.
   */
  public async login(userId: string) {
    await this.sodium.ready
    // this.#clearState()
    const deviceId = localStorage.getItem(`e2esdk:${userId}:device:id`)
    const deviceSecret = localStorage.getItem(`e2esdk:${userId}:device:secret`)
    if (
      !deviceId ||
      !deviceSecret ||
      !deviceSecretSchema.safeParse(deviceSecret).success
    ) {
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
        opaqueLogin.finish(deviceSecret, base64UrlDecode(loginResponse))
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

  /**
   * Revoke the current authentication session
   *
   * This will clear all local state and lock up the client.
   * A login step will be necessary to further resume authenticated operations.
   */
  public logout() {
    // todo: Do an API call to revoke the sessionId
    this.#clearState()
    this.#sync.setState(this.#state)
  }

  // Devices --

  /**
   * On an active device, prepare to enroll another device.
   *
   * This will retrieve the user account mainKey, generate a set of OPAQUE
   * credentials for the new device, perform an OPAQUE registration to obtain
   * an export key, and wrap the mainKey with it. The credentials are then
   * returned to the application to be transmitted to the new device for
   * final registration.
   *
   * @see {@link registerEnrolledDevice `registerEnrolledDevice`}, to be
   * called on the new device with the registration URI string returned by
   * this method. Transmission is left to the application, though an offline
   * delivery method (eg: scanning a QR code) is recommended.
   *
   * @authenticated This method requires authentication
   *
   * @param label Optional name to give the device, for later identification.
   *   Will be end-to-end encrypted when persisted on the server.
   * @returns A Promise to a registration URI string to send to the enrolled device.
   */
  public async enrollNewDevice(label?: string) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('enroll new device')
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
   *
   * Registration means saving the given credentials into local storage,
   * so that the login process can use them for authentication.
   *
   * In and out of itself, this method wouldn't do much, so it also attempts
   * to login to establish a session, as it would be the next logical step.
   *
   * @param uri device registration URI, as obtained from a call to
   *  {@link enrollNewDevice `enrollNewDevice`} on the originating device.
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

  /**
   * Retrieve a list of currently enrolled devices for this account.
   *
   * Also includes active session information for each device.
   *
   * @authenticated This method requires authentication
   */
  public async getEnrolledDevices() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('list enrolled devices')
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

  // todo: Devices & sessions APIs to implement:
  // - revokeDevice - DELETE /v1/auth/devices/${deviceId}
  // - revokeSession - DELETE /v1/auth/sessions/${sessionId}
  // - revokeAllOtherSessions - DELETE /v1/auth/sessions

  // Key Ops --

  /**
   * Create a new keychain for a given purpose, with an initial key (or key pair)
   *
   * This will create a key of the given algorithm, and attach it to a new
   * keychain, labelled with the given purpose.
   *
   * Note that two calls to this method with the same `purpose` will generate
   * different keychains (different `keychainFingerprint` values).
   *
   * If you want to rotate an existing key, use {@link rotateKey `rotateKey`}.
   *
   * @param purpose What this keychain will be used for, to let your application
   *   retrieve it later.
   * @param algorithm `secretBox` for symmetric encryption, `sealedBox` for form data.
   *   // todo: Add link to online docs that explains the difference
   * @param expiresAt Optional expiration date for the initial key
   *
   * @authenticated This method requires authentication
   */
  public async createNewKeychain(
    purpose: string,
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
    const keychainName = `${prefix}${NAME_PREFIX_SEPARATOR}${purpose}`
    return this.#addKey({
      keychainName,
      cipher,
      createdAt: new Date(),
      expiresAt,
      sharedBy: null,
    })
  }

  /**
   * Add a new key to an existing keychain, replacing the older one
   * for encryption operations.
   *
   * Previous keys remain available in the keychain for decryption operations.
   *
   * @param keychainFingerprint
   * @param expiresAt Optional expiration date for the new key
   *
   * @authenticated This method requires authentication
   */
  public async rotateKey(keychainFingerprint: string, expiresAt?: Date) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('rotate key')
    }
    if (!this.#state.keychain.has(keychainFingerprint)) {
      throw new Error('Cannot rotate key: no previous key found in keychain')
    }
    const [existingKey] = this.#state.keychain.get(keychainFingerprint)!
    const cipher =
      existingKey.cipher.algorithm === 'sealedBox'
        ? generateSealedBoxCipher(this.sodium)
        : existingKey.cipher.algorithm === 'secretBox'
        ? generateSecretBoxCipher(this.sodium)
        : (() => {
            throw new Error('Unsupported algorithm')
          })()
    return this.#addKey({
      keychainName: existingKey.keychainName,
      cipher,
      expiresAt,
      createdAt: new Date(),
      sharedBy: null,
    })
  }

  async #addKey({
    keychainName,
    cipher,
    createdAt = new Date(),
    expiresAt = null,
    sharedBy = null,
  }: Optional<
    Omit<KeychainItem, 'keychainFingerprint' | 'keyFingerprint'>,
    'createdAt' | 'expiresAt' | 'sharedBy'
  >): Promise<KeychainItemMetadata> {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError()
    }
    const keychainFingerprint = fingerprint(this.sodium, keychainName)
    const serializedCipher = serializeCipher(cipher)
    if (this.#state.keychain.has(keychainFingerprint)) {
      // Make sure the cipher algorithm remains the same,
      // but the key itself is different, for rotations.
      const [existingKey] = this.#state.keychain.get(keychainFingerprint)!
      if (cipher.algorithm !== existingKey.cipher.algorithm) {
        throw new Error(
          `Cannot rotate key ${keychainFingerprint} with different algorithm`
        )
      }
      if (serializedCipher === serializeCipher(existingKey.cipher)) {
        throw new Error('This key is already in your keychain')
      }
    }
    const subkeyIndex = this.sodium.randombytes_uniform(0x7fffffff) // Make it unsigned
    const { keychainNameCipher, keyWrappingCipher } =
      this.#deriveKeys(subkeyIndex)
    const keyFingerprint = fingerprint(this.sodium, serializedCipher)
    const createdAtISO = createdAt.toISOString()
    const expiresAtISO = expiresAt?.toISOString() ?? null
    const body: PostKeychainItemRequestBody = {
      ownerId: this.#state.identity.userId,
      sharedBy,
      createdAt: createdAtISO,
      expiresAt: expiresAtISO,
      subkeyIndex,
      encryptedKeychainName: encrypt(
        this.sodium,
        keychainName,
        keychainNameCipher,
        null,
        encodedCiphertextFormatV1
      ),
      encryptedKey: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        keyWrappingCipher,
        null,
        encodedCiphertextFormatV1
      ),
      keychainFingerprint,
      keyFingerprint,
      signature: base64UrlEncode(
        multipartSignature(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(sharedBy ?? ''),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
          numberToUint32LE(subkeyIndex),
          this.sodium.from_base64(keychainFingerprint),
          this.sodium.from_base64(keyFingerprint)
        )
      ),
    }
    await this.#apiCall('POST', '/v1/keychain', body)
    // todo: Handle API errors
    addToKeychain(this.#state.keychain, {
      keychainName,
      keychainFingerprint,
      keyFingerprint,
      cipher,
      createdAt,
      expiresAt,
      sharedBy,
    })
    this.#mitt.emit('keychainUpdated', null)
    this.#sync.setState(this.#state)
    return {
      purpose: keychainName.slice(NAME_PREFIX_LENGTH_CHARS),
      keychainFingerprint,
      keyFingerprint,
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

  /**
   * Get a record of available keys.
   *
   * @returns a record object keyed by the keychainFingerprint and whose values
   *   are arrays of keys, most recent first (the one used for encryption).
   *
   * @authenticated This accessor requires authentication
   */
  public get keys() {
    if (this.#state.state !== 'loaded') {
      return {}
    }
    const out: Record<string, KeychainItemMetadata[]> = {}
    this.#state.keychain.forEach(items => {
      if (items.length === 0) {
        return
      }
      out[items[0].keychainFingerprint] = items
        .map(getKeychainItemMetadata)
        .sort(byCreatedAtMostRecentFirst)
    })
    return out
  }

  /**
   * Find the most recent key (to use for encryption) for a given keychainFingerprint.
   *
   * Server-provided data uses the keychainFingerprint to identify purposes,
   * so this method can be used to retrieve a key based on that data.
   *
   * @authenticated This method requires authentication
   *   (will return `undefined` if unauthenticated)
   */
  public findKeyByKeychainFingerprint(keychainFingerprint: string) {
    if (this.#state.state !== 'loaded') {
      return undefined
    }
    const keys = this.#state.keychain.get(keychainFingerprint)
    return keys ? getKeychainItemMetadata(keys[0]) : undefined
  }

  /**
   * Find the most recent key (to use for encryption) for a given purpose.
   *
   * @authenticated This method requires authentication
   *   (will return `undefined` if unauthenticated)
   */
  public findKeyByPurpose(purpose: string) {
    if (this.#state.state !== 'loaded') {
      return undefined
    }

    const keys = Array.from(this.#state.keychain.values()).find(
      keys => keys[0].keychainName.slice(NAME_PREFIX_LENGTH_CHARS) === purpose
    )
    return keys ? getKeychainItemMetadata(keys[0]) : undefined
  }

  /**
   * Delete a specific key
   *
   * This will remove it both on the client's keychain and erase its record
   * on the server, and sync up other devices and clients for this user.
   *
   * @authenticated This method requires authentication
   *
   */
  public async deleteKey(keychainFingerprint: string, keyFingerprint: string) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('delete key')
    }
    const keys = this.#state.keychain.get(keychainFingerprint)
    if (!keys || keys.length === 0) {
      throw new Error(
        `No available key to delete with fingerprint ${keychainFingerprint}`
      )
    }
    // First, delete locally
    this.#state.keychain.set(
      keychainFingerprint,
      keys.filter(key => key.keyFingerprint !== keyFingerprint)
    )
    this.#mitt.emit('keychainUpdated', null)

    // Then delete on the server
    const url = `/v1/keychain/${keychainFingerprint}/${keyFingerprint}`
    await this.#apiCall('DELETE', url)

    // This should trigger a WebSocket notification which will
    // force reloading the keychain from the server, if we're online.
    // By deleting locally first, we prevent race conditions.
  }

  // Sharing --

  /**
   * Share only the most recent key in the given keychain with another e2esdk user.
   *
   * To share a specific key in a specific keychain, use {@link shareKey `shareKey`}.
   * To share the whole keychain, use {@link shareCompleteKeychain `shareCompleteKeychain`}.
   *
   * @param keychainFingerprint keychain to share (only the latest key)
   * @param shareWith Public identity of the user to share the key with
   *  (only the user ID and sharing public key are required)
   * @param options Optional bag of options (key expiration, etc..)
   *
   * @authenticated This method requires authentication
   */
  public shareMostRecentKey(
    keychainFingerprint: string,
    shareWith: Pick<PublicUserIdentity, 'userId' | 'sharingPublicKey'>,
    options: ShareKeyOptions = {}
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('share key')
    }
    const keychainItem = this.#state.keychain.get(keychainFingerprint)?.[0]
    if (!keychainItem) {
      throw new Error(
        `No available key to share in keychain ${keychainFingerprint}`
      )
    }
    return this.shareKey(
      keychainFingerprint,
      keychainItem.keyFingerprint,
      shareWith,
      options
    )
  }

  /**
   * Share all the keys available in a keychain with another e2esdk user.
   *
   * This may be useful to give complete access to a newcoming user in a
   * shared workspace.
   *
   * Note however that only the keys you possess will be shared. If other users
   * have a more extended keychain, their extra keys won't be shared.
   *
   * @param keychainFingerprint keychain to send to the user
   * @param shareWith Public identity of the user to share the key with
   *  (only the user ID and sharing public key are required)
   * @param options Optional bag of options (key expiration, etc..)
   *
   * @authenticated This method requires authentication
   */
  public async shareCompleteKeychain(
    keychainFingerprint: string,
    shareWith: Pick<PublicUserIdentity, 'userId' | 'sharingPublicKey'>,
    options: ShareKeyOptions = {}
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('share key')
    }
    // Make a copy of the keys before ordering by increasing `createdAt`,
    // otherwise we'd change the order in the state keychain Map
    const keys = [
      ...(this.#state.keychain.get(keychainFingerprint) ?? []),
    ].sort((a, b) => a.createdAt.valueOf() - b.createdAt.valueOf())
    // todo: Implement a parallel encryption process and sending shared keys
    // in a single batched call to the API.
    for (const key of keys) {
      await this.shareKey(
        keychainFingerprint,
        key.keyFingerprint,
        shareWith,
        options
      )
    }
  }

  /**
   * Share a specific key in a specific keychain with a specific e2esdk user.
   *
   * To share the latest key in a specific keychain, use {@link shareMostRecentKey `shareMostRecentKey`}.
   * To share the whole keychain, use {@link shareCompleteKeychain `shareCompleteKeychain`}.
   *
   * @param keychainFingerprint keychain where to find the key
   * @param keyFingerprint fingerprint of the key to share
   * @param shareWith Public identity of the user to share the key with
   *  (only the user ID and sharing public key are required)
   * @param options Optional bag of options (key expiration, etc..)
   *
   * @authenticated This method requires authentication
   */
  public async shareKey(
    keychainFingerprint: string,
    keyFingerprint: string,
    shareWith: Pick<PublicUserIdentity, 'userId' | 'sharingPublicKey'>,
    { expiresAt }: ShareKeyOptions = {}
  ) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('share key')
    }
    const keychainItem = this.#state.keychain
      .get(keychainFingerprint)
      ?.find(key => key.keyFingerprint === keyFingerprint)
    if (!keychainItem) {
      throw new Error(
        `No available key to share in keychain ${keychainFingerprint} with fingerprint ${keyFingerprint}`
      )
    }
    const serializedCipher = serializeCipher(keychainItem.cipher)
    if (keyFingerprint !== fingerprint(this.sodium, serializedCipher)) {
      throw new Error('Mismatching key fingerprint')
    }
    const sendTo: BoxCipher = {
      algorithm: 'box',
      privateKey: this.#state.identity.sharing.privateKey,
      publicKey: base64UrlDecode(shareWith.sharingPublicKey),
    }
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
      toUserId: shareWith.userId,
      createdAt: createdAtISO,
      expiresAt: expiresAtISO,
      encryptedKeychainName: encrypt(
        this.sodium,
        keychainItem.keychainName,
        sendTo,
        null,
        encodedCiphertextFormatV1
      ),
      encryptedKey: encrypt(
        this.sodium,
        randomPad(serializedCipher, CIPHER_MAX_PADDED_LENGTH),
        sendTo,
        null,
        encodedCiphertextFormatV1
      ),
      keychainFingerprint,
      keyFingerprint,
      signature: base64UrlEncode(
        multipartSignature(
          this.sodium,
          this.#state.identity.signature.privateKey,
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(shareWith.userId),
          this.sodium.from_string(createdAtISO),
          this.sodium.from_string(expiresAtISO ?? ''),
          base64UrlDecode(keychainFingerprint),
          base64UrlDecode(keyFingerprint),
          this.#state.identity.sharing.publicKey,
          this.#state.identity.signature.publicKey,
          base64UrlDecode(this.#state.identity.proof)
        )
      ),
    }
    await this.#apiCall('POST', '/v1/shared-keys', body)
  }

  /**
   * List pending shared keys from this user to others
   *
   * @authenticated This method requires authentication
   */
  public async getOutgoingSharedKeys() {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('list outgoing shared keys')
    }
    return getSharedKeysResponseBody.parse(
      await this.#apiCall<GetSharedKeysResponseBody>(
        'GET',
        '/v1/shared-keys/outgoing'
      )
    )
  }

  /**
   * Cancel sharing a key with someone else
   *
   * @authenticated This method requires authentication
   */
  public async deleteOutgoingSharedKey(
    toUserId: string,
    keyFingerprint: string
  ) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('delete outgoing shared key')
    }
    await this.#apiCall(
      'DELETE',
      `/v1/shared-keys/${toUserId}/${keyFingerprint}`
    )
  }

  // User Ops --

  /**
   * Get the identity of the currently logged-in user, or `null` if unauthenticated.
   */
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

  /**
   * Obtain the identity of a particular user
   *
   * This will ask the server for the public record of identity for the given
   * userId, and verify its proof.
   *
   * To lookup multiple users at once, use {@link getUsersIdentities `getUserIdentities`}.
   *
   * @param userId The user ID to lookup
   * @returns a Promise to the identity, or `null` if not found or invalid proof.
   *
   * @authenticated This method requires authentication
   */
  public async getUserIdentity(
    userId: string
  ): Promise<PublicUserIdentity | null> {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('get user identity')
    }
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

  /**
   * Lookup multiple user identities in one go.
   *
   * To lookup a single user, use {@link getUserIdentity `getUserIdentity`}.
   *
   * @param userIds a list of user ID to lookup
   *
   * @authenticated This method requires authentication
   */
  public async getUsersIdentities(
    userIds: string[]
  ): Promise<PublicUserIdentity[]> {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('get user identities')
    }
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

  /**
   * List users with access to a given key
   *
   * @param keychainFingerprint keychain fingerprint to lookup
   * @param keyFingerprint fingerprint of a particular key in the keychain
   * @returns an array of identities, permissions and other metadata
   *
   * @authenticated This method requires authentication
   */
  public async getParticipants(
    keychainFingerprint: string,
    keyFingerprint: string
  ) {
    await this.sodium.ready
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('list key participants')
    }
    try {
      const participants = getParticipantsResponseBody.parse(
        await this.#apiCall<GetParticipantsResponseBody>(
          'GET',
          `/v1/participants/${keychainFingerprint}/${keyFingerprint}`
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

  /**
   * Get your own permissions for a given keychain
   *
   * @param keychainFingerprint keychain fingerprint to lookup
   *
   * @authenticated This method requires authentication
   */
  public async getPermissions(keychainFingerprint: string) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('get keychain permissions')
    }
    const url = `/v1/permissions/${keychainFingerprint}`
    return permissionFlags.parse(await this.#apiCall('GET', url))
  }

  /**
   * Change permissions for another participant of a keychain
   *
   * This call will succeed only if you have the `allowManagement` permission
   * for the given keychain.
   * Note that you may apply permissions to yourself as well, including
   * revoking your `allowManagement` permission. If no other participant has
   * this right, permissions won't be able to be changed!
   *
   * @param userId User ID for whom to set permissions
   * @param keychainFingerprint Keychain fingerprint to apply the permissions to
   * @param permissions Partial object with boolean permissions to apply
   *
   * @authenticated This method requires authentication
   */
  public async setPermissions(
    userId: string,
    keychainFingerprint: string,
    permissions: Partial<PermissionFlags>
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('set keychain permissions')
    }
    const body: PostPermissionRequestBody = {
      userId,
      keychainFingerprint,
      ...permissions,
    }
    await this.#apiCall('POST', '/v1/permissions', body)
  }

  /**
   * Revoke access to the given keychain for a user.
   *
   * This requires the `allowDeletion` permission on the keychain
   * for the calling user.
   *
   * You can always ban yourself off of a keychain, regardless of permissions,
   * to allow cleaning up. Use this to remove all traces of a keychain
   * from your account.
   *
   * Note: banning does **not** perform key rotation.
   * If banning a user for security reasons, it is recommended to rotate
   * the current encryption key for all other remaining participants.
   *
   * The workflow is as such:
   * 1. Ban the user from the keychain using this method
   * 2. Rotate the key using {@link rotateKey}
   * 3. Obtain the list of participants for the keychain with {@link getParticipants}
   * 4. Share the latest key with the remaining participants using {@link shareMostRecentKey}
   *
   * @param userId user ID to ban
   * @param keychainFingerprint keychain fingerprint to remove access to
   *
   * @authenticated This method requires authentication
   */
  public async banUser(userId: string, keychainFingerprint: string) {
    const body: PostBanRequestBody = {
      userId,
      keychainFingerprint,
    }
    await this.#apiCall('POST', '/v1/ban', body)
  }

  // Encryption / Decryption --

  /**
   * Encrypt arbitrary data
   *
   * The algorithm will depend upon the keychain type, though this is mostly
   * useful for symmetric cryptography, using `secretBox` keys.
   *
   * @param input arbitrary data
   *  (strings, numbers, objects, arrays, as long as it's JSON-serialisable)
   * @param keychainFingerprint which keychain to use for encryption
   *   (the most recent key will be used)
   * @param additionalData Extra authenticated data that is not encrypted, but
   *   that must be presented as-is for decryption to succeed.
   *   This allows binding the ciphertext to a particular context.
   *   See https://en.wikipedia.org/wiki/Authenticated_encryption
   * @returns a string containing the encoded ciphertext and metadata
   *
   * @authenticated This method requires authentication
   */
  public encrypt<DataType>(
    input: DataType,
    keychainFingerprint: string,
    additionalData?: string | Uint8Array
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('encrypt')
    }
    const currentKey = this.#state.keychain.get(keychainFingerprint)?.[0]
    if (!currentKey) {
      throw new Error(
        `No key found with keychain fingerprint ${keychainFingerprint}`
      )
    }
    if ((currentKey.expiresAt?.valueOf() ?? Infinity) < Date.now()) {
      throw new Error(
        `Key ${keychainFingerprint}:${currentKey.keyFingerprint} has expired`
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

  /**
   * Decrypt arbitrary data
   *
   * Note: to decrypt form data, use {@link unsealFormData `unsealFormData`}.
   *
   * This will try decrypting a given ciphertext string against all available
   * keys in the specified keychain. If all keys are exhausted without success,
   * an error will be thrown.
   *
   * @param input arbitrary data
   *  (strings, numbers, objects, arrays, as long as it's JSON-serialisable)
   * @param keychainFingerprint which keychain to use for encryption
   *   (the most recent key will be used)
   * @param additionalData Extra authenticated data that was not encrypted, but
   *   that must be presented as-is for decryption to succeed.
   *   This allows binding the ciphertext to a particular context.
   *   See https://en.wikipedia.org/wiki/Authenticated_encryption
   * @returns an unknown type: you must pass this through a parser that ensures
   *   the clear text data conforms to a specific type, in order to prevent
   *   from untrusted inputs.
   *
   * @authenticated This method requires authentication
   */
  public decrypt(
    ciphertext: string,
    keychainFingerprint: string,
    additionalData?: string | Uint8Array
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('decrypt')
    }
    const keys = this.#state.keychain.get(keychainFingerprint) ?? []
    if (keys.length === 0) {
      throw new Error(
        `No key found with keychain fingerprint ${keychainFingerprint}`
      )
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

  /**
   * Decrypt form data encrypted with `encryptFormData`.
   *
   * @param submission encrypted form data & associated cryptographic metadata
   * @param keychainFingerprint keychain to use for decryption
   * @returns a record of unknown values: you must pass the result through a
   * parser that ensures form data conforms to a specific type, to avoid and
   * reject untrusted / malformed data submissions.
   *
   * @authenticated This method requires authentication
   */
  public unsealFormData<FormData extends object>(
    submission: EncryptedFormSubmission<FormData>,
    keychainFingerprint: string
  ): Record<keyof FormData, unknown> {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('decrypt')
    }
    const keys = this.#state.keychain.get(keychainFingerprint) ?? []
    if (keys.length === 0) {
      throw new Error(
        `No key found with keychain fingerprint ${keychainFingerprint}`
      )
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

  /**
   * Sign an arbitrary array of string items against the user's identity
   *
   * This should be used with care, especially if dealing with untrusted
   * user-provided inputs, even though the underlying signature algorithm
   * has protections against canonicalization attacks.
   *
   * Note: the order of items must be the same for signature and verification!
   *
   * @param items List of items to generate a signature for
   * @returns a base64url-encoded signature string
   *
   * @authenticated This method requires authentication
   */
  public sign(...items: string[]) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('sign')
    }
    const signature = multipartSignature(
      this.sodium,
      this.#state.identity.signature.privateKey,
      ...items.map(str => this.sodium.from_string(str))
    )
    return base64UrlEncode(signature)
  }

  /**
   * Verify the signature of an arbitrary array of string items
   * against a given user's identity.
   *
   * This should be used with care, especially if dealing with untrusted
   * user-provided inputs, even though the underlying signature algorithm
   * has protections against canonicalization attacks.
   *
   * Note: the order of items must be the same for signature and verification!
   *
   * @param signature Signature string as obtained from {@link sign `sign`}.
   * @param publicKey Signature public key of the alleged author
   *  (part of the public identity). Can be provided as base64url or byte array.
   * @param items List of items to verify the signature against
   * @returns true if the signature is valid, false otherwise.
   */
  public verifySignature(
    signature: string,
    publicKey: string | Uint8Array,
    ...items: string[]
  ) {
    if (this.#state.state !== 'loaded') {
      throwAccountIsLockedError('verify signature')
    }
    const pk =
      typeof publicKey === 'string' ? base64UrlDecode(publicKey) : publicKey
    return verifyMultipartSignature(
      this.sodium,
      pk,
      base64UrlDecode(signature),
      ...items.map(str => this.sodium.from_string(str))
    )
  }

  // Helpers --
  // We're not using the sodium conversions because those need it
  // to be ready, and we want to be able to encode/decode at any time.

  /**
   * Encode the input byte array to base64url
   */
  public encode(input: Uint8Array) {
    return base64UrlEncode(input)
  }

  /**
   * Decode a base64url-encoded string into a byte array
   */
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
          base64UrlDecode(lockedItem.signature),
          this.sodium.from_string(this.#state.identity.userId),
          this.sodium.from_string(lockedItem.sharedBy ?? ''),
          this.sodium.from_string(lockedItem.createdAt),
          this.sodium.from_string(lockedItem.expiresAt ?? ''),
          numberToUint32LE(lockedItem.subkeyIndex),
          this.sodium.from_base64(lockedItem.keychainFingerprint),
          this.sodium.from_base64(lockedItem.keyFingerprint)
        )
      ) {
        console.warn('Invalid keychain entry detected:', lockedItem)
        continue
      }
      const { keychainNameCipher, keyWrappingCipher } = this.#deriveKeys(
        lockedItem.subkeyIndex
      )

      // todo: Decryption error handling
      const item: KeychainItem = {
        keychainName: keychainNameSchema.parse(
          decrypt(
            this.sodium,
            lockedItem.encryptedKeychainName,
            keychainNameCipher
          )
        ),
        keychainFingerprint: lockedItem.keychainFingerprint,
        keyFingerprint: lockedItem.keyFingerprint,
        cipher: cipherParser.parse(
          secureJSON.parse(
            serializedCipherSchema
              .parse(
                decrypt(this.sodium, lockedItem.encryptedKey, keyWrappingCipher)
              )
              .trim()
          )
        ),
        createdAt: new Date(lockedItem.createdAt),
        expiresAt: lockedItem.expiresAt ? new Date(lockedItem.expiresAt) : null,
        sharedBy: lockedItem.sharedBy,
      }
      if (
        fingerprint(this.sodium, item.keychainName) !== item.keychainFingerprint
      ) {
        console.warn('Invalid keychain fingerprint:', lockedItem)
        continue
      }
      if (
        fingerprint(this.sodium, serializeCipher(item.cipher)) !==
        item.keyFingerprint
      ) {
        console.warn('Invalid key fingerprint', lockedItem)
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
            base64UrlDecode(sharedKey.fromSignaturePublicKey),
            base64UrlDecode(sharedKey.signature),
            this.sodium.from_string(sharedKey.fromUserId),
            this.sodium.from_string(this.#state.identity.userId),
            this.sodium.from_string(sharedKey.createdAt),
            this.sodium.from_string(sharedKey.expiresAt ?? ''),
            base64UrlDecode(sharedKey.keychainFingerprint),
            base64UrlDecode(sharedKey.keyFingerprint),
            base64UrlDecode(sharedKey.fromSharingPublicKey),
            base64UrlDecode(sharedKey.fromSignaturePublicKey),
            base64UrlDecode(sharedKey.fromProof)
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
          publicKey: base64UrlDecode(sharedKey.fromSharingPublicKey),
        }
        const item: KeychainItem = {
          keychainName: keychainNameSchema.parse(
            decrypt(
              this.sodium,
              sharedKey.encryptedKeychainName,
              withSharedSecret
            )
          ),
          keychainFingerprint: sharedKey.keychainFingerprint,
          keyFingerprint: sharedKey.keyFingerprint,
          cipher: cipherParser.parse(
            secureJSON.parse(
              serializedCipherSchema
                .parse(
                  decrypt(this.sodium, sharedKey.encryptedKey, withSharedSecret)
                )
                .trim()
            )
          ),
          createdAt: new Date(sharedKey.createdAt),
          expiresAt: sharedKey.expiresAt ? new Date(sharedKey.expiresAt) : null,
          sharedBy: sharedKey.fromUserId,
        }
        // Verify fingerprints
        if (
          fingerprint(this.sodium, item.keychainName) !==
          item.keychainFingerprint
        ) {
          throw new Error('Invalid shared keychain fingerprint')
        }
        if (
          fingerprint(this.sodium, serializeCipher(item.cipher)) !==
          item.keyFingerprint
        ) {
          throw new Error('Invalid shared key fingerprint')
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
        recipientPublicKey: this.config.serverSignaturePublicKey,
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
      recipientPublicKey: this.config.serverSignaturePublicKey,
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
      this.config.serverSignaturePublicKey,
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

  #deriveKeys(subkeyIndex: number) {
    if (this.#state.state !== 'loaded') {
      throw new Error('Account is locked')
    }
    const keychainNameCipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: this.sodium.crypto_kdf_derive_from_key(
        sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        'nameSubK', // name sub-key
        this.#state.identity.keychainBaseKey
      ),
    }
    const keyWrappingCipher: SecretBoxCipher = {
      algorithm: 'secretBox',
      key: this.sodium.crypto_kdf_derive_from_key(
        sodium.crypto_secretbox_KEYBYTES,
        subkeyIndex,
        'pyldSubK', // payload sub-key
        this.#state.identity.keychainBaseKey
      ),
    }
    return {
      keychainNameCipher,
      keyWrappingCipher,
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
  const items = keychain.get(newItem.keychainFingerprint) ?? []
  if (items.length === 0) {
    keychain.set(newItem.keychainFingerprint, [newItem])
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

/**
 * Strip down an internal keychain item to its public-facing properties
 */
function getKeychainItemMetadata(item: KeychainItem): KeychainItemMetadata {
  return {
    algorithm: item.cipher.algorithm,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    // Remove the 32 bytes base64-encoded plus separator `:`
    purpose: item.keychainName.slice(NAME_PREFIX_LENGTH_CHARS),
    keychainFingerprint: item.keychainFingerprint,
    keyFingerprint: item.keyFingerprint,
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

// --

function throwAccountIsLockedError(operation?: string): never {
  const msg = `Account is locked` + (operation ? `: cannot ${operation}` : '')
  throw new Error(msg)
}
