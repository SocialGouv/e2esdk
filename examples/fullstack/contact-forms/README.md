# Contact Forms

This example project uses the following stack:

- Next.js application front-end
- PostgreSQL application database
- Hasura GraphQL API layer
- The e2esdk server as a Docker image
- PostgreSQL database for the e2esdk server

## Getting started

Install dependencies and build internal packages:

```shell
pnpm install
pnpm -w build:npm
```

Setup Hasura:

```shell
cp -f src/hasura/.env.example src/hasura/.env
```

Start the docker compose stack:

```shell
docker compose up -d --build
```

This will boot all containers and run migrations on the e2esdk database.

If you wish to seed the database with
[test users](../../../packages/server/src/database/seeds/identities.ts),
run the following command:

```shell
docker compose run e2esdk-db-ops pnpm db seed
```

Start the Next.js application in development:

```
pnpm dev
```

The application will be available on http://localhost:4000
