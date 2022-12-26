# Contact Forms

This example project uses the following stack:

- Next.js application front-end
- PostgreSQL application database
- Hasura GraphQL API layer
- E2ESDK as a Docker image
- PostgreSQL database for e2esdk

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

This will boot all containers and run migrations on the E2ESDK database.

If you wish to seed the database with test users, run the following command:

```shell
docker compose run e2esdk-db-ops pnpm db seed
```

Start the Next.js application in development:

```
pnpm dev
```

The application will be available on http://localhost:4000

### FAQ

How to change the data model with Hasura UI ?

Go to hasura admin consol in http://localhost:4000 and use the password defined in `./src/hasura/.env`.

Make your changes then `npx hasura-cli metadata export` from the CLI to update your hasura metadata.

### Todo

- [ ] a way to persist my ID on signup (qr-code?)
- [ ] better hasura data permissions
