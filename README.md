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
| `infra/docker-compose.yml` | Local PostgreSQL 16 (PostGIS, ltree, pgvector; image built from `infra/postgres`), MinIO (S3 photos), Mailpit (email) |

## Setup

```sh
pnpm install          # installs all workspaces from pnpm-lock.yaml
pnpm db:up            # starts PostgreSQL, MinIO and Mailpit in Docker (builds the database image the first time)
cp .env.example .env  # then fill in secrets
export DATABASE_URL=postgres://kiezruf:kiezruf@localhost:5432/kiezruf
pnpm --filter api db:migrate   # applies the SQL migrations in apps/api/drizzle
pnpm --filter api db:seed      # loads the tenant tree: Berlin and its 12 Bezirke
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
| `pnpm test:int` | API integration tests on PostgreSQL 16 with PostGIS, ltree and pgvector via Testcontainers. Runs the real migrations and tenant seed. | Docker |
| `pnpm test:features` | Gherkin features: cucumber-js (API) and playwright-bdd + axe (web) | `pnpm --filter web exec playwright install chromium` once |
| `pnpm --filter api test:features:wip` | Lists the steps still pending in `@wip` features | — |
| `pnpm test:mobile` | Mobile unit tests (jest-expo) | — |
| `pnpm test:maestro` | Mobile end-to-end flows on a simulator | [Maestro CLI](https://maestro.mobile.dev), a dev build, `APP_ID` |
| `pnpm audit` | Dependency audit, fails on high or critical | — |

How the suites map to the plan:

- **Acceptance criteria** are the Gherkin scenarios from the engineering plan, kept word for word in `apps/api/features` and `apps/web/features`. Each carries its story tag (`@US-42`) and `@wip` until the story is built. CI skips `@wip` and fails on any pending step in the rest, so remove `@wip` only when every step is real.
- **Placeholders** use `it.todo` / `test.todo`. They show up as "todo" in every run, so the list of tests still to write is always visible. Turn each into a real test in the PR that builds the feature.
- **Tenant isolation** (`apps/api/test/integration/tenant-isolation.int.test.ts`) is the Phase 0 exit test. Every new staff endpoint adds a case there.

## Database

- Tables are defined in `apps/api/src/db/schema.ts`. After changing it, run `pnpm --filter api db:generate` and commit the new file in `apps/api/drizzle`. drizzle-kit puts quotes around `geography(Point,4326)`; remove them in the generated SQL.
- Triggers, database roles, row-level security policies and views are hand-written SQL migrations (`pnpm --filter api exec drizzle-kit generate --custom --name=<name>`).
- Staff queries go through `withStaffScope` (`apps/api/src/db/scope.ts`), never through the plain connection. It limits the transaction to the caller's tenant subtree.
- Berlin Bezirk boundaries in `apps/api/src/db/seed/berlin-bezirke.geojson` come from Geoportal Berlin (ALKIS Bezirke) through the Technologiestiftung Berlin open-data copy.

## Not yet decided

- Mobile map library (react-native-maps vs MapLibre) — add with `npx expo install` so versions match the Expo SDK.
- AI provider SDK: vlincta.com endpoint and models (D-13, D-15). The API calls it over HTTP; no package needed yet.
- Boundary import for tenants outside Berlin (BKG VG250) needs GDAL's `ogr2ogr`: `brew install gdal`. The script is not written yet.
