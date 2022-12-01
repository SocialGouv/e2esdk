# Identity

Users in e2esdk are identified by the following cryptographic elements:

- A unique user ID _(string between 1 and 128 characters long)_
- A signature key pair _(Ed25519)_
- A sharing key pair _(X25519)_
- A proof of integrity _(see [Identity proof](#identity-proof))_

The user ID, public keys and the proof are sent to the server on signup.

## Identity proof

The proof is the signature of the following elements:

- The user ID
- The sharing public key

Since the signature public key is already part of the signature
calculation (Ed25519 has exclusive ownership), it's not necessary to
re-include it in the elements to sign.

This allows everyone with the complete identity record to verify its
integrity, by verifying the signature against the public key.

Note that the proof is only here to ensure data integrity,
not authenticity.

## Derivation from main key

On signup and login, the complete identity is derived from the supplied
user ID and main key.

First, the user ID is hashed (BLAKE2b) to get a constant output length
of 32 bytes, corresponding to a BLAKE2b key size.

Then, the main key is hashed (BLAKE2b) with that key, to avoid the case
where two different users having somehow the same main key ending up
with the same derived identity.
This ensures uniqueness of the tuple (userId, mainKey).
The output size is also 32 bytes, this time corresponding to the input
size of Sodium's key derivation function (also based on BLAKE2b).
We call this output the intermediate key.

From the intermediate key, we derive the following subkeys,
with context `e2esdkid`:

- A signature seed (32 bytes), with subkey index 0
- A sharing seed (32 bytes), with subkey index 1
- A keychain base key (32 bytes), with subkey index 2

From the two seeds, we generate the corresponding derived key pairs.

## Updating identities

It should be possible to update a user's identity in case the main key
becomes compromised.

Assuming the previous main key is still available (not lost),
the identity to update can be signed with the previous identity,
as any other authenticated operation.

Since there are other elements derived from the main key, a transactional
update of encrypted keychain items should be performed in one step.
