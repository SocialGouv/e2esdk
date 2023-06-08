---
sidebar_position: 0
---

# Overview

In traditional web applications, data encryption is usually only applied at
the transport layer (TLS/HTTPS), and at rest on database server disks:

![Data is encrypted (TLS) in the transport between client and server, and further between server and database, as well as at rest on the database server disk, but everywhere else is available in clear-text.](/img/data-visibility-traditional-apps.png)

End-to-end encrypted applications have the same guarantees, but add a layer of
client-side cryptography that ensures that nobody else than clients has access
to clear-text data:

![Data is encrypted and decrypted at the boundaries of the client, and the rest of the backend architecture only deals with ciphertext.](/img/data-visibility-e2ee.png)

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
