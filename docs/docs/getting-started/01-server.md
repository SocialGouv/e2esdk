# Deploying the server

The e2esdk server is available as a [Docker image](https://github.com/SocialGouv/e2esdk/pkgs/container/e2esdk%2Fserver):

```shell
docker pull ghcr.io/socialgouv/e2esdk/server
```

## Credentials

import { SignatureKeygenUI } from '@site/src/components/Keygen'

Before starting the server, you will need a public/private signature key pair.

You can use the one used in the examples as-is, or <SignatureKeygenUI/>

:::info

_This keygen runs locally on your browser, check the source code._

:::

## Using Docker Compose

We will use Docker Compose (v2) to bootstrap the e2esdk stack, made of:

- The e2esdk server
- A PostgreSQL database

The corresponding compose file would look like this:

```yaml title="docker-compose.yml"
version: '3'

name: e2esdk-getting-started

services:
  db:
    image: postgres:14
    ports:
      - '3002:5432'
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=e2esdk
    volumes:
      # The example persists the database to the host filesystem
      # to keep data across stack restarts, feel free to remove:
      - .volumes/docker/$COMPOSE_PROJECT_NAME/db:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      start_period: 3s
      interval: 1s
      retries: 10

  e2esdk-server:
    image: ghcr.io/socialgouv/e2esdk/server:beta
    ports:
      - '3001:3000'
    environment:
      # This is the URL where this server will be accessible:
      - DEPLOYMENT_URL=http://localhost:3001

      # URL to the database in the Docker stack network:
      - POSTGRESQL_URL=postgres://postgres:password@e2esdk-db:5432/e2esdk

      # Replace signature keypair with your own if you wish
      - SIGNATURE_PUBLIC_KEY=gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE
      - SIGNATURE_PRIVATE_KEY=___examples-server-signkey__NOT-FOR-PROD__yCwTsHrcRO00MjMDBcSndfUe_XZYIoYfqHtutXdT00oQ

      # CORS configuration assumes your app runs on localhost:3000
      - CORS_ALLOWED_ORIGINS=http://localhost:3000
    links:
      - e2esdk-db
    depends_on:
      app-db:
        condition: service_healthy
      e2esdk-db-apply-migrations:
        # Wait for migrations be to applied before starting (see below)
        condition: service_completed_successfully

  # This short-lived task applies pending migrations to the PostgreSQL database
  # before the server starts.
  e2esdk-db-apply-migrations:
    image: ghcr.io/socialgouv/e2esdk/server:beta
    environment:
      - POSTGRESQL_URL=postgres://postgres:password@e2esdk-db:5432/e2esdk
    command: pnpm db migrations apply
    links:
      - e2esdk-db
    depends_on:
      e2esdk-db:
        condition: service_healthy
```

## Starting the stack

```shell
docker compose up -d
```
