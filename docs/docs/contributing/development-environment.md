# Development environment

To configure the monorepo in a development environment:

Install dependencies:

```shell
pnpm install
```

Setup environment files:

```shell
cp ./packages/server/.env.example ./packages/server/.env
```

Start the Docker compose stack:

```shell
docker compose up -d
```

Build the server and its dependencies to setup the database:

```shell
pnpm build:server
```

Setup the database by applying pending migrations, and optionally seed the database
with [the usual suspects](https://github.com/SocialGouv/e2esdk/blob/beta/packages/server/src/database/seeds/identities.ts).

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
  The server is listening on <http://localhost:3001>
- Start a Vite host SPA for the devtools component, on <http://localhost:3000>
- Start the Docusaurus documentation server on <http://localhost:3003/e2esdk>

## Port list

- `3000` Vite SPA to host the devtools
- `3001` Server
- `3002` PostgreSQL database
- `3003` Docusaurus documentation
