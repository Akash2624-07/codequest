# CodeQuest

A learning-first online judge. Instead of a flat problem list, learners follow
guided journeys through data structures and algorithms, from arrays to dynamic
programming. Submissions are judged asynchronously on a self-hosted Judge0, and
progress turns into XP, streaks and a public stats profile. It is a TypeScript
monorepo: an Express API, a background worker and a React web app, backed by
MongoDB and Redis.

**Status:** early development. The repository holds the design documents and an
empty npm-workspaces root. Setup instructions will be added with the first
runnable version.

## Documentation

- [Project brief](docs/01-project-brief.md): goals, lessons from the first
  version, features, the XP economy and the release plan.
- [Architecture](docs/02-architecture.md): how the pieces fit together.
- Decision records:
  - [02_01 · Sessions vs JWT](docs/02_01-sessions-vs-jwt.md)
  - [02_02 · JavaScript → TypeScript](docs/02_02-javascript-to-typescript.md)
  - [02_03 · Monorepo, npm workspaces and Turborepo](docs/02_03-monorepo-and-workspaces.md)
  - [02_04 · Keycloak and identity providers](docs/02_04-keycloak-and-identity-providers.md)

## License

[MIT](LICENSE)
