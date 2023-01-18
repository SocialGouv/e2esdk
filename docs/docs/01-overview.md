---
sidebar_position: 0
---

# Overview

**e2esdk** is made of two parts:

- Client NPM packages to be installed and used in your front-end application code
- A server that manages identities and encryption keys

Users register their cryptographic identities on the server,
and use it to store encrypted keys.

Users can then retrieve those keys to encrypt and decrypt application data.

Users can also choose to securely share keys with others, to access shared
workspaces.

The SDK also provides secure ways to ingest structured data from the outside
(eg: forms), using public key cryptography.
