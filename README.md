# e2esdk

[![Apache-2.0 License](https://img.shields.io/github/license/SocialGouv/e2esdk.svg?color=blue)](https://github.com/SocialGouv/e2esdk/blob/main/LICENSE)
[![CI](https://github.com/SocialGouv/e2esdk/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SocialGouv/e2esdk/actions/workflows/ci.yml)

SDK to build end-to-end encrypted web applications

## About

This project is made of two parts:

- Client NPM packages to be installed and used in your front-end application code
- A server that manages identities and encryption keys

Users register their cryptographic identities on the server,
and use it to store encrypted keys.

Users can then retrieve those keys to encrypt and decrypt application data.

Users can also choose to securely share keys with others, to access shared
workspaces.

Private workspaces (using forward-secrecy) are planned but not yet available.

The SDK also provides secure ways to ingest structured data from the outside
(eg: forms), using public key cryptography.

### Application layer

This project only deals with cryptographic keys, and the cryptographic
algorithms to encrypt and decrypt data with those keys.

What your data looks like, where it is stored and how it flows through your
application is entirely up to you. This allows easy integration in any kind of
stack.

## Client libraries

- [`@e2esdk/client`](./packages/client) - Main client interface
- [`@e2esdk/crypto`](./packages/crypto) - Cryptographic primitives
- [`@e2esdk/react`](./packages/react) - React bindings (context provider & hooks)
- [`@e2esdk/devtools`](./packages/devtools) - Devtools UI in a WebComponent

> Note: while we do provide React bindings, the `@e2esdk/client` package is
> entirely framework-agnostic, and will work in any modern browser.
>
> We do not yet provide a non-browser (Node.js) client implementation.

## Server

The server is published as a Docker image at
[`ghcr.io/socialgouv/e2esdk/server`](https://github.com/SocialGouv/e2esdk/pkgs/container/e2esdk%2Fserver)

The only external requirement is a PostgreSQL database.

[Server documentation](./packages/server/README.md)

## Documentation

- [Cryptography](./docs/cryptography)

## Contributing

- [How to setup a development environment](./docs/development-environment.md)
- [Monorepo architecture](./docs/monorepo-architecture.md)

License: Apache-2.0