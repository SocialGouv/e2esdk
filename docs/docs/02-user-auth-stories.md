# User authentication stories

Some applications don't use passwords for application authentication (OAuth,
SSO, magic auth link via email), so in this case we don't want to impose the use
of a password.

If the application DOES use a username/password authentication system, the
user password (the string of characters typed by the user) COULD be used as-is
to authenticate them against the application server, but doing so would prevent
using this password for any kind of cryptography (as it would violate E2EE).

Whether using a password or not, some sort of secret will be at the root of
a user account, from which cryptographic keys can be derived.

This secret will be necessary to unlock the cryptographic identity and keychain
of the user. Therefore its obtention will be necessary on all devices (physical
machine + browser context) where the user wishes to use their account.

This secret will have to be protected by one of the following:

- Something you know (a password) -> we ruled that out
- Something you are (biometrics) -> Not accessible on the Web, requires hardware
- Something you have (device)

Posession of an enrolled device should be sufficient to unlock the account,
but this raises a few problems:

1. What happens if the device is stolen (unauthorized access)
2. What happens if the device is lost (account recovery)

Enrolled devices may need to be revoked to address point 1, with addition to a
credential rotation strategy to lock the stolen device out of the account.

Lost devices would also require a credential rotation (loss implies the theft
thread model).

Both scenarios also raise the concept of account recovery: if there are N > 1
devices enrolled, the system tolerates the loss of N - 1 devices before requiring
an account recovery procedure: use another enrolled device to perform the
credential rotation, and use it to enroll a replacement device if necessary.

However, if the lost/stolen device was the unique way to access the account,
a recovery strategy is necessary to maintain account access.

## Registration

> **Definition**: creating a user account on the application, a user identity on
> e2esdk, and binding them cryptographically.

Implies current device enrollment, and may include account recovery setup procedures.

When registering a new account on e2esdk, the user will start by generating
a random main key, which will be the "main key" to their account.

From this main key, their identity will be derived, as well as a base key to
derive keychain encryption keys.

Along with the main key, a device secret is generated, and used as an OPAQUE
registration password.

The signup procedure involves performing an OPAQUE registration against the
user ID (obtained from the application layer, and which should be immutable)
and the device secret.

Once the OPAQUE export key is obtained after the first handshake, it is used
to wrap the main key to send it to the server.

On the device is stored:

- The device secret
- The device ID

## Log in

> **Definition**: from an enrolled device, authenticate against e2esdk, retrieve and
> decrypt the client state (keychain, pending shared keys).

## New device enrollment

> **Definition**: from an already enrolled device, securely share the required
> information with another device for it to be able to log in.

Enrolling a new device consists in:

1. Performing an OPAQUE registration on an already enrolled device
2. Transferring the device secret and ID to the new device
3. Performing an OPAQUE login on the new device to authenticate it

-> How do we prove we have access to the main secret in step 1?
That should involve some sort of signature, coupled with the API authentication.

## Credentials rotation

> **Definition**: from an enrolled device, rotate the information that allows
> logging in.

Note that this will essentially lock all other devices out of the account,
which will need to be re-enrolled one by one. An automated way of doing this
may be considered.

## Account recovery

> **Definition**: if no enrolled device is available, this describes a way to obtain
> the information that allows logging in (essentially to enroll a new device).

Account recovery involves retrieving the main secret from an external source,
like joining two or more Shamir shares of the secrets generated beforehand.

The e2esdk server could store one of those shares, and two more should be given
to the user (to tolerate loss of one at most). This scheme would allow the user
to recompose their main key even without cooperation of the server.

## Device management

> **Definition**: revoking access to existing enrolled devices from an enrolled
> device itself.
