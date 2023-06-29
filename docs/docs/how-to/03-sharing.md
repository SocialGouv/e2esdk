---
description: Exchanging keys with other users.
---

# Sharing

Encrypting data for your own use is good, but giving access to shared workspaces
to others is the heart of e2esdk.

## Sharing keys with others

Depending on how much granularity you want, you can choose to share:

- An entire keychain
- Only the most recent key in a keychain
- A specific key in a specific keychain

First, you'll have to obtain the public identity of the recipient you
wish to share keys with:

```ts
const bob = await e2esdkClient.getUserIdentity("bob's-user-id")
```

```ts
await e2esdkClient.shareMostRecentKey(keychainFingerprint, bob)
await e2esdkClient.shareCompleteKeychain(keychainFingerprint, bob)

// Share a specific key
await e2esdkClient.shareKey(
  keychainFingerprint,
  'isnZrYGaNYLhBTKIG3Eg81xUsHz6WgcXkm5nKwZLyho',
  bob
)
```

## Receiving shared keys

There is nothing to do here. Shared keys will be automatically added to
your keychains when a e2esdk client is connected, in real time.

You can [subscribe to events](#reacting-to-received-shared-keys) to be
notified of an incoming shared key being added to a keychain.

## Listing outgoing shared keys

```ts
const sharedKeys = await e2esdkClient.getOutgoingSharedKeys()

// Note: you can cancel an in-flight shared key
// before it is received by the recipient.
await e2esdkClient.deleteOutgoingSharedKey(
  "bob's-user-id",
  'isnZrYGaNYLhBTKIG3Eg81xUsHz6WgcXkm5nKwZLyho' // key fingerprint
)
```

## Listing participants

_Participants_ are the users who own a copy of a particular key.

```ts
await e2esdkClient.getParticipants(keychainFingerprint, keyFingerprint)
```

## Banning users

Banning implies that you have the `allowDeletion` [permission](#permissions) on the keychain to ban a user from.

```ts
await e2esdkClient.banUser(userId, keychainFingerprint)
```

:::caution

Banning a user does **not** perform [key rotation](./keys#rotating-a-key) on the given keychain.

Post-ban key rotation is recommended to ensure forward secrecy.

:::

## Permissions

There are four permissions related to sharing and key/user interactions
in e2esdk:

- `allowSharing`
- `allowRotation`
- `allowDeletion`
- `allowManagement`

A user [creating a new keychain](./keys#creating-a-key) will be granted
all permissions on it. It is then up to them to choose permissions to
grant others when sharing keys.

**`allowSharing`** allows the recipient of a key to further share it
with others.

**`allowRotation`** allows a user to create a new key in a given
keychain, via the [`rotateKey`](./keys#rotating-a-key) mechanism.

**`allowDeletion`** allows users to [ban](#banning-users) others from
the keychain. Banning yourself is always allowed and doesn't require
this permission.

**`allowManagement`** allows user to manage their permissions and that
of others. It is the highest level of privilege.

Setting permissions is done on a per-user, per-keychain basis:

```ts
await e2esdkClient.setPermissions(userId, keychainFingerprint, {
  allowSharing: true,
  allowRotation: true,
  // Anything omitted will be left as-is. Default is to deny.
})
```

Reading permissions for a user/keychain tuple can be done in the
[participants](#listing-participants) result.

## Reacting to received shared keys

The `keyReceived` event lets you subscribe to accepted incoming shared keys:

```ts
const off = e2esdkClient.on('keyReceived', ({ keyFingerprint, sharedBy }) => {
  console.log(`Received key ${keyFingerprint} from ${sharedBy}`)
})

// Unsubscribe when you're done
off()
```

:::info

The `keyReceived` event will be fired **after** the key has been received
and added to your keychain.

This means the `keychainUpdated` event will fire first, then `keyReceived`.

:::
