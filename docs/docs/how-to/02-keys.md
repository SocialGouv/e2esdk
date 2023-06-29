---
description: Working with keys and keychains.
---

# Keys

## Creating a key

You're creating a brand new workspace, either for yourself or to later
share with others.

```ts
// Eg: creating an encrypted channel in a Slack-like chat app:
const purpose = '#random' // name of the channel, for later queries
const algorithm = 'secretBox'

const { keychainFingerprint } = await e2esdkClient.createNewKeychain(
  purpose,
  algorithm
)
```

:::tip What algorithm do I need?

Use **`secretBox`** to encrypt data that can be **read and written** by
all the owners of the key.<br/>
Ideal for individual access - _only I can read
and write my own data_ - or for groups where new members may need to
access previously encrypted data.

Use **`sealedBox`** to let anyone encrypt data using the public key,
but only owners of the private key can decrypt the data. Ideal for [forms](./forms).

:::

## Listing available keychains & keys

```ts
for (const [keychainFingerprint, keys] of Object.entries(e2esdkClient.keys)) {
  // Note: keys[0] is the most recent key, used for encryption.
}
```

## Querying keys

Your front-end can refer to keys in two ways:

- Via the `purpose` string given when creating the keychain
- Via the returned `keychainFingerprint`

While leaking the `purpose` string to the application server is not
critical for the security of e2esdk, it may contain sensistive
information.

In this case, you may want to only transmit the `keychainFingerprint` to
the application server (eg: to list the members of a channel).

```ts
// Query by purpose
let key = e2esdkClient.findKeyByPurpose('#random')

// Query by fingerprint
key = e2esdkClient.findKeyByKeychainFingerprint(
  '_fLejJfeYcHpM87qoXderPmxN0F_8Ms1DeCX30UYEpM'
)

// Returned metadata contains useful references:
key.keychainFingerprint
key.keyFingerprint
key.purpose
```

:::info

Only the most recent key (the one used for encryption) is returned.

:::

## Rotating a key

Rotation means replacing the current key in a keychain with a new one.
Older keys remain available for decrypting existing data.

```ts
await e2esdkClient.rotateKey(keychainFingerprint)
```

## Revoking a key

You need to specify both the keychain **and** the specific key in that
keychain to revoke:

```ts
await e2esdkClient.deleteKey(keychainFingerprint, keyFingerprint)
```

:::note

This will only delete **your** copy of the key, not others'.

:::

## Reacting to keychain changes

The `keychainUpdated` event lets you subscribe to keychain events:

```ts
const off = e2esdkClient.on('keychainUpdated', () => {
  // New list of keychains & keys:
  e2esdkClient.keys
})

// Unsubscribe when you're done
off()
```

In React, you can use the `useE2ESDKClientKeys` hook:

```tsx
import React from 'react'
import { useE2ESDKClientKeys } from '@socialgouv/e2esdk-react'

export const Keys: React.FC = () => {
  const keys = useE2ESDKClientKeys()

  if (Object.keys(keys).length === 0) {
    return <p>You have no keys</p>
  }

  return (
    <ul>
      {Object.entries(keys).map(([keychainFingerprint, keys]) => (
        <li key={keychainFingerint}>
          {keys[0].purpose}: {keys.length} keys
        </li>
      ))}
    </ul>
  )
}
```
