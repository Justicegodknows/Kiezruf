# Kiezruf

Citizen reporting platform. The plan, user stories and clickable prototypes live in
`kiezruf-mvp-prototype.html` — that file is the source of truth.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Citizen app, Expo (React Native), iOS + Android |
| `apps/web` | Next.js: citizen web and municipal admin console |
| `apps/api` | Fastify API, Drizzle ORM on PostgreSQL + PostGIS, pg-boss jobs |
| `packages/shared` | Shared types and rules (priority score, levels) |
| `infra/docker-compose.yml` | Local PostGIS, MinIO (S3 photos), Mailpit (email) |

## Setup

```sh
pnpm install          # installs all workspaces from pnpm-lock.yaml
pnpm db:up            # starts PostGIS, MinIO and Mailpit in Docker
cp .env.example .env  # then fill in secrets
pnpm dev:api          # http://localhost:4000/health
pnpm dev:web          # http://localhost:3000
pnpm dev:mobile       # Expo dev server
```

Mailpit UI: http://localhost:8025 · MinIO console: http://localhost:9001

## Tests

| Command | What runs | Needs |
|---|---|---|
| `pnpm test` | Gate tests, then unit tests in every workspace (Vitest, Jest for mobile) | — |
| `pnpm test:gate` | GOV-01 progress-gate tests (Node's built-in runner) | git |
| `pnpm test:coverage` | Unit tests with coverage (`packages/shared` has thresholds) | — |
| `pnpm test:int` | API integration tests on Postgres 16 + PostGIS via Testcontainers | Docker |
| `pnpm test:features` | Gherkin features: cucumber-js (API) and playwright-bdd + axe (web) | `pnpm --filter web exec playwright install chromium` once |
| `pnpm --filter api test:features:wip` | Lists the steps still pending in `@wip` features | — |
| `pnpm test:mobile` | Mobile unit tests (jest-expo) | — |
| `pnpm test:maestro` | Mobile end-to-end flows on a simulator | [Maestro CLI](https://maestro.mobile.dev), a dev build, `APP_ID` |
| `pnpm audit` | Dependency audit, fails on high or critical | — |

How the suites map to the plan:

- **Acceptance criteria** are the Gherkin scenarios from the engineering plan, kept word for word in `apps/api/features` and `apps/web/features`. Each carries its story tag (`@US-42`) and `@wip` until the story is built. CI skips `@wip` and fails on any pending step in the rest, so remove `@wip` only when every step is real.
- **Placeholders** use `it.todo` / `test.todo`. They show up as "todo" in every run, so the list of tests still to write is always visible. Turn each into a real test in the PR that builds the feature.
- **Tenant isolation** (`apps/api/test/integration/tenant-isolation.int.test.ts`) is the Phase 0 exit test. Every new staff endpoint adds a case there.

## Not yet decided

- Mobile map library (react-native-maps vs MapLibre) — add with `npx expo install` so versions match the Expo SDK.
- AI provider SDK: vlincta.com endpoint and models (D-13, D-15). The API calls it over HTTP; no package needed yet.
- Boundary import (BKG VG250, Berlin Bezirke) needs GDAL's `ogr2ogr`: `brew install gdal`.
