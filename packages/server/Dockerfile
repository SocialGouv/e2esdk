# Based on Turbo's Docker pruning technique:
# https://turbo.build/repo/docs/handbook/deploying-with-docker

FROM node:16-alpine AS slicer
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
# to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
RUN yarn global add turbo
COPY . .
RUN turbo prune --scope=@e2esdk/server --docker --out-dir docker-dist

# ------------------------------------------------------------------------------

# Add lockfile and package.json's of isolated subworkspace
FROM node:16-alpine AS builder
RUN apk add --no-cache libc6-compat
# this enables support for pnpm - https://nodejs.org/api/corepack.html
RUN corepack enable
WORKDIR /app

# First install the dependencies (as they change less often)
COPY .gitignore .
COPY --from=slicer /app/docker-dist/json/ .
COPY --from=slicer /app/docker-dist/pnpm-lock.yaml .
RUN pnpm install --frozen-lockfile

# Build the project
COPY --from=slicer /app/docker-dist/full/ .
COPY turbo.json turbo.json
RUN pnpm build --filter=@e2esdk/server

# ------------------------------------------------------------------------------

FROM node:16-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 e2esdk
USER e2esdk

COPY --from=builder --chown=e2esdk:nodejs /app/ .

EXPOSE 3000

CMD ["node", "packages/server/build/main.js"]
