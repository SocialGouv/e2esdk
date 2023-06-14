# Development environment

To configure the monorepo in a development environment:

Install [`mkcert`](https://github.com/FiloSottile/mkcert) on your machine
and generate local TLS certificates with:

```shell
pnpm mkcert
```

Install dependencies:

```shell
pnpm install
```

Setup environment files:

```shell
cp ./packages/server/.env.example ./packages/server/.env
```

> **Note**: Look into the .env file for instructions on how to change the
> required secrets (OPAQUE setup, signature key pair, session keys etc).

Start the Docker compose stack:

```shell
docker compose up -d
```

Build the server and its dependencies:

```shell
pnpm build:server
```

Setup the database by applying pending migrations, and optionally seed the database
with [the usual suspects](#test-users).

```shell
pnpm db migrations apply
pnpm db seed
```

Start the `dev` script:

```shell
pnpm dev
```

The `dev` script will:

- Build all packages in watch mode
- Start the server with nodemon, watching its dependencies to
  allow auto-reloading the server when the sources change.
  The server is listening on <https://localhost:3001>
- Start a Vite host SPA for the devtools component, on <https://localhost:3000>
- Start the Docusaurus documentation server on <http://localhost:3004/e2esdk>

## Port list

- `3000` Vite SPA to host the devtools
- `3001` Server
- `3002` PostgreSQL database
- `3003` Redis key/value store & cache
- `3004` Docusaurus documentation

## Test users

A [list of sample identities](https://github.com/SocialGouv/e2esdk/blob/beta/packages/server/src/database/seeds/identities.ts)
can be seeded to the development database.
The seed provides an identity and a device for each user.

To login as a particular user, you'll have to use their `deviceRegistrationURI`
to save their credentials to your local development browser.
This can be done with a call to the `registerEnrolledDevice` on the e2esdk
client, or via the devtools.
