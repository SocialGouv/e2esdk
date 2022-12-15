# Based on Turbo's Docker pruning technique:
# https://turbo.build/repo/docs/handbook/deploying-with-docker

FROM node:16-alpine AS slicer
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
# to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
# Though the rest of the monorepo uses pnpm, we can use yarn here to save one layer.
RUN yarn global add turbo
COPY . .
RUN turbo prune --scope=@socialgouv/e2esdk-server --docker --out-dir docker-dist

# ------------------------------------------------------------------------------

# Add lockfile and package.json's of isolated subworkspace
FROM node:16-alpine AS builder
RUN apk add --no-cache libc6-compat
# this enables support for pnpm - https://nodejs.org/api/corepack.html
RUN corepack enable
WORKDIR /app

COPY .gitignore .

# First install the dependencies (as they change less often) in a virtual cache
# which can itself be cached in a Docker layer. See https://pnpm.io/cli/fetch
COPY --from=slicer /app/docker-dist/pnpm-lock.yaml .
RUN pnpm fetch --frozen-lockfile

# Import the various package.json to list deps
COPY --from=slicer /app/docker-dist/json/ .

# Install from in-memory cache
RUN pnpm install --offline

# Build the project
COPY --from=slicer /app/docker-dist/full/ .
COPY turbo.json .
RUN pnpm turbo build:server

# Only keep runtime dependencies
RUN rm -rf node_modules
RUN find -type d -name node_modules -exec rm -rf {} +
RUN find -type d -name .turbo -exec rm -rf {} +
RUN pnpm install --offline --prod --ignore-scripts

# ------------------------------------------------------------------------------

FROM node:16-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

RUN corepack enable

ARG BUILD_URL=local
ENV BUILD_URL $BUILD_URL
ENV NODE_ENV production
ENV PORT 3000

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs && \
  adduser  --system --uid 1001 e2esdk
USER e2esdk

COPY --from=builder --chown=e2esdk:nodejs /app/ .

RUN packages/server/node_modules/.bin/sceau verify --strict --packageDir packages/server

LABEL org.opencontainers.image.url="$BUILD_URL"

EXPOSE 3000

HEALTHCHECK \
  --interval=10s \
  --timeout=30s \
  --start-period=1s \
  --retries=5 \
  CMD curl -f http://localhost:3000/_health || exit 1

CMD ["node", "packages/server/build/main.js"]
