FROM hasura/graphql-engine:v2.2.2.cli-migrations-v3

ARG APP_URL
ENV APP_URL $APP_URL

COPY migrations /hasura-migrations
COPY metadata /hasura-metadata
