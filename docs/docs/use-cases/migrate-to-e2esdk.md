# Encrypt an existing database

## Users identity

If your application has existing users, you have to explicitly onboard the `application user` to let them create a cryptographic identity (the `e2esdk user`). This is done **on the client**.

```js
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'

const client = useE2ESDKClient()

// some user uuid from your application
const uuid = session.user.id

// signup the user to e2esdk
await client.signup(uuid)

// login existing user
await client.login(uuid)
```

The client is password-less thanks to devices storing their secrets in `localStorage`, and once logged-in you can start encrypting/decrypting your payloads.

> The `uuid` must be stable for a given user, not an email because it could be changed by the user.

## Database impacts

If you e2e encrypt your database fields, **your server won't be able to do any processing** on these. Filtering, sorting, grouping will only be available client-side in your frontend UI, once data is decrypted.

The main challenge regarding converting clear-text data to e2e encrypted in an existing application is that **you cannot migrate data server-side** so you have to implement it client-side and encrypt progressively.

- we recommend adding a `[fieldname]_encrypted` field to your DB
- on the client side:
  - `read`: if the `[fieldname]_encrypted` field is filled, decrypt it and use it. if not, use `[fieldname]`
  - `write`: when user updates data, encrypt it and POST the `[fieldname]_encrypted` field
- progressively cleanup cleartext data (at runtime, when `[fieldname]_encrypted` is provided, or via some cronjob)

## Read encrypted data

This is how you could read and decrypt a `firstName` field coming from your API and for which you have a decryption key.

```js
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'

const client = useE2ESDKClient()

// the encryption key fingerpint, ex: secret-database
const keychainFingerprint = 'secret-database'

const customers = await fetch('/api/customers', {
  method: 'GET',
})
  .then(r => r.json())
  .then(collection => {
    // decrypt the field in each row
    return collection.data.map(async customer => {
      // if data have been encrypted, decrypt it. if not, use cleartext value if any
      const firstName = await (customer.firstName_encrypted
        ? client.decrypt(customer.firstName_encrypted, keychainFingerprint)
        : customer.firstName)
      return {
        ...customer,
        firstName,
      }
    })
  })

console.log(customers)
```

> :bulb: In real life, you'll add TypeScript, Zod validation and error management (see examples)

## Write encrypted data

This is how you could encrypt some of your fields and POST encrypted data to your API:

```js
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'

const client = useE2ESDKClient()

const firstName = 'Uma'
const lastName = 'Thurman'

// the encryption key fingerpint, ex: secret-database
const keychainFingerprint = 'secret-database'

// encrypt values
const firstName_encrypted = await client.encrypt(firstName, keychainFingerprint)
const lastName_encrypted = await client.encrypt(lastName, keychainFingerprint)

// POST encrypted data to your API
await fetch(API_URL, {
  method: 'POST',
  body: JSON.stringify({
    firstName_encrypted,
    lastName_encrypted,
  }),
})
```

Be aware that if other users needs to decrypt the data, you need to share them the key (see below)

## Key sharing

As `e2esdk` only act on your client-side application, if you want to share encrypted data with other users, you need to explicitly send them a shared decryption key in the SDK context.

```js
const client = useE2ESDKClient()

// this key name, ex: secret-database
const keychainFingerprint = await client.findKeyByPurpose('secret-database')?.keychainFingerprint

// fetch recipient identity
const recipientIdentity = await client.getUserIdentity('some-user-uuid')

// share key to recipient
await client.shareKey(keychainFingerprint, recipientIdentity)
```

There is no delay or confirmation, if the user is connected, its client-side application will receive the key and will be able to encrypt/decrypt instantly.

> Both users must have already called `client.signup` to be able to exchange keys.

## Wipe the clear-text

Regulary wipe clear-text data from your DB, ex:

```sql
UPDATE table SET firstName=NULL WHERE firstName_encrypted is not NULL;
```
