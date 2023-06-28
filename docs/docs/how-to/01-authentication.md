---
description: Working with users, accounts, and identities.
---

# Authentication

## Signing up

The `userId` to provide at signup should be a **unique immutable string**.

Ideally, it should be tied to the primary key (or ID) of the equivalent
`User` object/table in your application database.

```ts
await e2esdkClient.signup(userId)
```

:::tip

User IDs don't have to be secret, autoincremented integers (represented
as a string) are perfectly fine.

:::

## Logging in

```ts
await e2esdkClient.login(userId)
```

:::note

Wait a second, there's no password?

:::

Access to e2esdk is authorized through enrolled [devices](./devices).

:::tip

The device where you signed up is pre-enrolled. To login on other
devices, you'll have to [enroll and register](./devices#enroll-a-new-device) them first.

:::

## Whoami

To know the identity of the currently logged in user:

```ts
const identity = e2esdkClient.publicIdentity

if (identity === null) {
  // Anonymous / not logged in
} else {
  const { userId } = identity
}
```

:::tip

When [sharing keys](./sharing), you might want to show the complete
identity record of the recipient, to let the sender verify the
recipient's identity via offline means.

:::

## Logging out

```ts
await e2esdkClient.logout()
```

## Reacting to changes

The `identityUpdated` event lets you subscribe to authentication events:

```ts
const off = e2esdkClient.on('identityUpdated', identity => {
  if (identity === null) {
    console.info('Logged out')
  } else {
    console.info(`User ${identity.userId} logged in`)
  }
})

// Unsubscribe when you're done
off()
```

In React, you can use the `useE2ESDKClientIdentity` hook:

```tsx
import React from 'react'
import { useE2ESDKClientIdentity } from '@socialgouv/e2esdk-react'

export const Profile: React.FC = () => {
  const identity = useE2ESDKClientIdentity()

  if (identity === null) {
    return <p>Logged out</p>
  }

  // A more "visual" way to represent this information
  // for users to easily eye-match would be preferable.
  const cryptographicIdentity = [
    identity.signaturePublicKey,
    identity.sharingPublicKey,
    identity.proof,
  ].join('.')

  return (
    <ul>
      <li>UserID: {identity.userId}</li>
      <li>Identity: {cryptographicIdentity}</li>
    </ul>
  )
}
```
