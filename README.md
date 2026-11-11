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
cp .env.example .env  # the API, migrations and seed read it
pnpm --filter api db:migrate   # applies the SQL migrations in apps/api/drizzle
pnpm --filter api db:seed      # loads the tenant tree: Berlin and its 12 Bezirke
# MinIO: create the buckets photos-private and photos-public once in the console (http://localhost:9001)
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
- Every API query runs under one database role (`apps/api/src/db/scope.ts`): `withStaffScope` for staff (tenant subtree), `withCitizenSession` for a signed-in citizen (public data plus their own rows), `withCitizenAccess` for anonymous reads, `withAuthAccess` for sign-in. Never query through the plain connection in a route.
- Berlin Bezirk boundaries in `apps/api/src/db/seed/berlin-bezirke.geojson` come from Geoportal Berlin (ALKIS Bezirke) through the Technologiestiftung Berlin open-data copy.

## API (citizen core)

Sign in with an email code, then send `Authorization: Bearer <token>`. Errors are `{ "error": "<code>" }`; the apps translate the codes.

| Endpoint | What |
| --- | --- |
| `POST /auth/code` · `POST /auth/verify` · `POST /auth/logout` · `GET /me` | Email one-time code (6 digits, 10 min, 5 tries), 30-day session (US-01) |
| `GET /public/route?lat&lon` | Receiving office for a point, or not live (US-41, US-44) |
| `POST /public/report-attempts` `{ lat, lon }` | Same answer, for the report flow: a not-live answer counts as demand (US-44). No account needed |
| `GET /public/reports?lat&lon[&radiusM&category&status&maxAgeDays]` · `GET /public/reports/:publicId` | Map, list and detail without an account. No score, level or capture data (US-15, US-24) |
| `POST /uploads` | Presigned PUT URL for one original photo in the private bucket (US-06) |
| `POST /reports` | Post on-site: 1–3 photos, accuracy ≤ 100 m, capture ≤ 48 h old (US-03, US-41). Starts as `processing` |
| `GET /me/reports` | The citizen's own reports (US-11) |
| `PUT` / `DELETE /reports/:publicId/me-too` | Me too, on-site within 150 m; undo (US-18, D-03) |
| `GET /public/reports/:publicId/comments` | Visible comments, oldest first, no author (US-19) |
| `POST /reports/:publicId/comments` · `POST /comments/:id/flag` | Comment up to 500 characters; `held: true` when the language filter holds it for review. Flag any comment (US-19) |
| `PUT` / `DELETE /reports/:publicId/follow` · `GET /me/follows` | Follow a report. Posting and Me too follow automatically (US-20) |
| `GET /reports/:publicId/me` | The signed-in citizen's relation to a report: `{ following, meToo, mine }` |
| `PUT` / `DELETE /me/push-token` | Register or remove an Expo push token `{ token, platform }` (US-29) |
| `GET` / `PUT /me/notification-settings` | `{ statusChange: { push, email }, goLive: { push, email } }`, all on by default. Push goes to accounts with a push token; email goes when push is off or there is no token (US-29) |
| `POST /go-live-alerts` | "Tell me when it starts here" for the tenant at `{ lat, lon }` (US-44) |
| `PATCH /me` · `DELETE /me` | Change language `{ locale }` (US-35); delete the account at once, reports stay as "a neighbour" (US-34) |

Error codes the apps translate: `unauthorized`, `invalid_request`, `invalid_code`, `too_many_attempts`, `too_many_codes`, `not_found`, `not_live`, `no_metadata`, `accuracy_too_low`, `capture_too_old`, `capture_in_future`, `description_required`, `pin_too_far`, `photo_missing`, `duplicate_photo`, `not_on_site`, `already_live`, `no_tenant`.

Status changes and go-live are sent by the worker (`pnpm --filter api worker`). Push payloads carry only a generic text and the report ID (engineering plan, Push caveat).

## Maps

MapLibre on both clients (ENG-13): `maplibre-gl` on the web, `@maplibre/maplibre-react-native` in the app (needs an Expo dev build, not Expo Go). The style URL comes from `NEXT_PUBLIC_MAP_STYLE_URL` and `EXPO_PUBLIC_MAP_STYLE_URL`; development defaults to the public OpenFreeMap style. The production tile host is open (E-08).

## Not yet decided

- AI provider SDK: vlincta.com endpoint and models (D-13, D-15). The API calls it over HTTP; no package needed yet.
- Boundary import for tenants outside Berlin (BKG VG250) needs GDAL's `ogr2ogr`: `brew install gdal`. The script is not written yet.
