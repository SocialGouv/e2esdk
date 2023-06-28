---
description: Managing user devices.
---

# Devices

[Authentication](./authentication) in e2esdk is done through enrolled devices.

A device is the pair of a **physical machine** and a **browser context** _(local storage)_.

For example, the following are all considered different devices:

- Firefox on Alice's macBook Pro
- Firefox on Alice's iMac _(different physical machine)_
- Chrome on Alice's macBook Pro _(different browser)_
- Firefox in Private Browsing mode on Alice's macBook Pro _(different context)_

The device you used at [signup](./authentication#signing-up) is your
first enrolled device.

## List my devices

This also gives you a list of active sessions for each device:

```ts
const devices = await e2esdkClient.getEnrolledDevices()

const myDeviceId = e2esdkClient.currentDeviceId
```

## Enroll a new device

This is a two step process, which requires an authenticated client.

First, we're provisioning a new device on the e2esdk server:

```ts
// On the existing device

// Optionally give a name to the device, for later identification:
const label = "Firefox on Alice's macBook Pro"

const registrationURI = await e2esdkClient.enrollNewDevice(label)
```

Then transmit the `registrationURI` string to the device to enroll, in a **secure, out-of-band** manner.

:::tip

The best way to transmit it would be a QR code displayed on the existing
device and scanned by the device to enroll, as long as this QR code is
safe from prying eyes.

:::

:::danger

The `registrationURI` lets anyone in its possession access your account.
Keep it safe while in transit, don't store it, and definitely don't send
it via your application server, as it would break the end-to-end promise.

:::

You can now register the new device:

```ts
// On the device to enroll:

const registrationURI = scanQRCodeOrOtherMeans()
await e2esdkClient.registerEnrolledDevice(registrationURI)
```

The new device is now logged in!

## Revoke a device

If one of your enrolled devices was lost or stolen, you may want to
revoke its access to your account.

:::caution todo

Implement this method in the e2esdk client.

:::

## Recovery

Recovery on e2esdk is done via an offline "paper" device.

You would first [enroll a new device on the server](#enroll-a-new-device),
then back up the resulting registration URI and keep it safe.

Good locations for this URI would be a secure password manager, or printing it
on paper as a QR code (to ease the restoration process) and locking the paper
in a safe.

:::tip

For extra fault tolerance, you could split the recovery URI into shares
using a [Shamir Secret Sharing](https://francoisbest.com/horcrux) scheme.

Generating three shares with two needed to recompose the secret allows
storage redundancy and tolerance to the loss of one share.

:::
