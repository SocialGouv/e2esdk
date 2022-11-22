# Development environment

To configure the monorepo in a development environment:

Install dependencies:

```
$ pnpm install
```

Setup environment files:

```shell
$ cp ./packages/server/.env.example ./packages/server/.env
```

Start the Docker compose stack:

```shell
$ docker compose up -d
```

Build the server and its dependencies to setup the database:

```shell
$ pnpm build --filter server
```

Setup the database by applying pending migrations:

```shell
$ pnpm db migrations apply
```

Start the `dev` script:

```shell
$ pnpm dev
```

The `dev` script will:

- Build all packages in watch mode
- Start the server with nodemon, watching its dependencies to
  allow auto-reloading the server when the sources change.
  The server is listening on http://localhost:3001
- Start a Vite host SPA for the devtools component, on http://localhost:3000

## Port list

- `3000` Vite SPA to host the devtools
- `3001` Server
- `3002` PostgreSQL database
