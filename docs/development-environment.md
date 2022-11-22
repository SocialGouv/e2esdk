# Development environment

To configure the monorepo in a development environment:

1. Start the Docker compose stack:

```shell
$ docker compose up -d
```

2. Build the dependencies to setup the database

```shell
$ pnpm build --filter server
```

3. Setup your database by applying pending migrations:

```shell
$ pnpm db migrations apply
```

4. Start the `dev` script:

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
