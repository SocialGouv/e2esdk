import { base64UrlDecode, base64UrlEncode } from '../shared/codec'
import { ready, sodium } from '../sodium/sodium'
import {
  decryptFormData,
  decryptFormForEdition,
  encryptFormData,
} from './encryption'
import {
  clearEncryptedFormLocalState,
  generateEncryptedFormLocalState,
  initializeEncryptedFormLocalState,
  isEncryptedFormLocalStatePersisted,
  listPersistedEncryptedFormLocalStates,
  persistEncryptedFormLocalState,
} from './state'

const localStorageMock = (function () {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    getItem(key: string) {
      return store[key]
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    clear() {
      store = {}
    },
    removeItem(key: string) {
      delete store[key]
    },
    key(index: number) {
      return Object.keys(store)[index]
    },
    getAll() {
      return store
    },
  }
})()

const TEST_KEY_PAIR = {
  publicKey: base64UrlDecode('QV4W8xDJLzmdlnFFobppKWQb2WbOEAGR2lrPQogNXQA'),
  privateKey: base64UrlDecode('bd0d1TLbthKjfc5ZiIdUu5cQ88LHVHcSq8-v9wIfMW0'),
}

const TEST_DATA = {
  firstName: 'James',
  lastName: 'Brown',
  age: 73,
  dateOfBirth: new Date('1933-05-03'),
  isAlive: false,
  occupations: ['singer', 'musician', 'record producer', 'band leader'],
  children: {
    min: 9,
    max: 13,
  },
}

beforeAll(async () => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock })
  await ready
  const publicKey = sodium.crypto_scalarmult_base(TEST_KEY_PAIR.privateKey)
  expect(publicKey).toEqual(TEST_KEY_PAIR.publicKey)
})

describe('forms', () => {
  test('state init', async () => {
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    expect(state.formPublicKey).toEqual(TEST_KEY_PAIR.publicKey)
    expect(state.keyDerivationContext).toEqual('QV4W8xDJ')
    expect(state.sodium.ready).resolves.toBe(void 0)
    // States are not persisted by default
    expect(listPersistedEncryptedFormLocalStates()).toEqual([])
  })

  test('state retrieval', async () => {
    const namespace = 'namespace'
    const state1 = await generateEncryptedFormLocalState(
      TEST_KEY_PAIR.publicKey
    )
    persistEncryptedFormLocalState(state1, namespace)
    expect(
      window.localStorage.getItem('e2esdk:forms:localState:namespace')
    ).toEqual(base64UrlEncode(state1.mainSecret))
    const state2 = await initializeEncryptedFormLocalState(
      namespace,
      TEST_KEY_PAIR.publicKey
    )
    expect(state2.mainSecret).toEqual(state1.mainSecret)
    expect(state2.formPublicKey).toEqual(state1.formPublicKey)
    expect(state2.identity.privateKey).toEqual(state1.identity.privateKey)
    expect(state2.keyDerivationSecret).toEqual(state1.keyDerivationSecret)
    expect(listPersistedEncryptedFormLocalStates()).toEqual([namespace])
    expect(isEncryptedFormLocalStatePersisted(namespace)).toBe(true)
  })

  test('state cleanup', async () => {
    const namespace = 'namespace'
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    persistEncryptedFormLocalState(state, namespace)
    expect(listPersistedEncryptedFormLocalStates()).toEqual([namespace])
    expect(isEncryptedFormLocalStatePersisted(namespace)).toBe(true)
    clearEncryptedFormLocalState(namespace)
    expect(listPersistedEncryptedFormLocalStates()).toEqual([])
    expect(isEncryptedFormLocalStatePersisted(namespace)).toBe(false)
  })

  test('encrypting data, decryption via private key', async () => {
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    const submission = encryptFormData(TEST_DATA, state)
    const decrypted = decryptFormData(state.sodium, submission, {
      algorithm: 'sealedBox',
      ...TEST_KEY_PAIR,
    })
    expect(decrypted).toEqual(TEST_DATA)
  })

  test('encrypting data, decryption via local state (edition)', async () => {
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    const submission = encryptFormData(TEST_DATA, state)
    const decrypted = decryptFormForEdition(submission, state)
    expect(decrypted).toEqual(TEST_DATA)
  })

  test("edition - refuse to edit other's submissions", async () => {
    const pk = TEST_KEY_PAIR.publicKey
    const stateA = await generateEncryptedFormLocalState(pk)
    const stateB = await generateEncryptedFormLocalState(pk)
    const subA = encryptFormData(TEST_DATA, stateA)
    const subB = encryptFormData(TEST_DATA, stateB)
    expect(() => decryptFormForEdition(subA, stateB)).toThrowError(
      'Cannot decrypt submission: incorrect author'
    )
    expect(() => decryptFormForEdition(subB, stateA)).toThrowError(
      'Cannot decrypt submission: incorrect author'
    )
  })

  test('edition - refuse to edit incomplete bundles', async () => {
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    const submission = encryptFormData(TEST_DATA, state)
    // @ts-ignore
    delete submission.encrypted.isAlive
    expect(() => decryptFormForEdition(submission, state)).toThrowError(
      'Cannot decrypt submission: invalid signature'
    )
  })

  test('edition - detect tampering', async () => {
    const state = await generateEncryptedFormLocalState(TEST_KEY_PAIR.publicKey)
    const submission = encryptFormData(TEST_DATA, state)
    const firstName = submission.encrypted.firstName
    const lastName = submission.encrypted.lastName
    // Note that this would also fail due to field name authentication,
    // but here we're verifying that the signature check fails first.
    submission.encrypted.firstName = lastName
    submission.encrypted.lastName = firstName
    expect(() => decryptFormForEdition(submission, state)).toThrowError(
      'Cannot decrypt submission: invalid signature'
    )
  })
})
