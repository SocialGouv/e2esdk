# Monorepo Architecture

## Tooling

We use the following tools throughout the monorepo:

- [PNPM](http://pnpm.io) for dependency management
- [Turborepo](https://turbo.build/repo) for task management & caching
- [Changesets](https://github.com/changesets/changesets) for updating version numbers & maintaining changelogs
- [`tsup`](https://github.com/egoist/tsup) for bundling TypeScript code into ESM/CJS/.d.ts outputs for NPM
- [SWC](https://swc.rs/) for transpiling the TypeScript server code into ESM, and to transpile sources on-the-fly for Jest _(faster than Babel)_
- [Jest](https://jestjs.io/) for unit testing
- [Prettier](https://prettier.io/) for code formatting
- [`zx`](https://github.com/google/zx) for scripting
- [Husky](https://typicode.github.io/husky/#/) for Git hooks management
- Docker for packaging the server code into a deployable image
- Docker Compose for declaring local development & example stacks
- GitHub Actions for CI/CD

## Configuration

Development tooling configuration is located in `<root>/config`.
It includes base configuration files for the TypeScript typechecker,
Jest for testing, Husky git hooks definitions, etc..
