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

## API (admin console, Phase 2)

Staff sign in with the email code (`POST /auth/code`), then a TOTP second factor, and get a 12-hour staff session (`Authorization: Bearer`). Every `/staff/*` route runs inside the caller's tenant subtree (US-42): a report outside it answers `404`, never `403`. Viewers read; case workers and tenant admins change reports of the tenant that owns them (ENG-05). Score and level appear only here (US-24).

| Endpoint | What |
| --- | --- |
| `POST /staff/auth/verify` `{ email, code }` | Checks the email code. `{ challenge, next: "totp" }`, or `{ challenge, next: "enroll", otpauthUri, secret }` the first time. `403 not_staff` without a role |
| `POST /staff/auth/totp` `{ challenge, totp }` | Confirms the 6-digit authenticator code (and enrolment) and returns `{ token, expiresAt }` |
| `POST /staff/auth/logout` · `GET /staff/me` | End the session · `{ id, email, grants: [{ tenantId, tenantName, path, role }] }` |
| `GET /staff/reports?status&level&category&tenantId&maxAgeDays&sort=score\|age&limit&offset` | Priority queue, by score by default (US-25). Rows carry `score`, `level`, `levelChangedAt`, `override`, `spike`, counts, `tenant`, `editable` |
| `GET /staff/reports/:publicId` | Detail: photos (blurred URL and a short-lived original URL), location, capture data, `breakdown` (`coReporters`, `commenters`, `meToo`, `base`, `ageHours`, `decay`, `dangerMarks`, `dangerMultiplier`, `safetyCategory`, `safetyMultiplier`, `score`), `thresholds`, `publicNote`, all comments with flag counts, `history` (US-22, US-23, US-27) |
| `PATCH /staff/reports/:publicId/status` `{ status, publicNote?, reason? }` | `open`, `acknowledged`, `in_progress`, `resolved`, or `rejected` (reason required). The public note shows to citizens; followers are notified (US-28) |
| `PUT /staff/reports/:publicId/override` `{ level \| null, reason }` | Manual level with a required reason; `null` clears it (US-27) |
| `POST /staff/reports/:publicId/forward` `{ tenantId \| contactId, publicNote }` | To a parent or sibling tenant (it becomes theirs; the original queue keeps it read-only) or to a saved external contact by email with a login-free link (US-45) |
| `POST /staff/reports/:publicId/merge` `{ into }` | Merge a duplicate into another report of the same tenant. Votes, follows and comments move without double counting; the duplicate's author becomes a co-reporter (US-17) |
| `POST /staff/reports/:publicId/spike` `{ action: "confirm" \| "clear", reason }` | Keep or lift the half weight of new accounts' votes on a flagged report (US-26, US-37) |
| `GET /staff/moderation` | Held and flagged comments, flagged vote spikes, reports held after failed blur (US-33) |
| `PATCH /staff/comments/:id` `{ state: "visible" \| "removed", reason }` · `POST /staff/accounts/:id/ban` `{ reason }` | Restore or remove a comment; ban an account (tenant admins) |
| `GET /staff/tenants` · `PATCH /staff/tenants/:id` `{ status }` · `PUT /staff/tenants/:id/settings` `{ thresholds: { critical, high, medium }, office }` | Tenant tree in scope; activate a node (platform admin); thresholds and office name (tenant admin) (US-40, US-46) |
| `GET` / `POST /staff/tenants/:id/contacts` · `DELETE /staff/tenants/:id/contacts/:contactId` | External contacts for forwarding `{ name, email }` |
| `GET` / `POST /staff/tenants/:id/staff` · `DELETE /staff/tenants/:id/staff/:accountId` | Staff and roles at a node; inviting `{ email, role }` mails a console link (US-42, US-46) |
| `GET /forwarded/:token` | The report behind a forward link, without login; `410 link_expired` after 90 days (US-45) |

More error codes: `not_staff`, `invalid_totp`, `challenge_expired`, `read_only`, `invalid_transition`, `reason_required`, `not_same_tenant`, `invalid_target`, `link_expired`, `forbidden_role`.

Citizen payloads gain `publicNote` on report detail (US-28). The first platform admin is created with `pnpm --filter api staff:grant <email> <tenant-path> platform_admin`.

## API (analysis and AI, Phase 3)

The AI provider (vlincta.com, D-13, D-15) is called through an OpenAI-compatible API (`AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, models in `AI_MODEL_*`). Comment and description text is pseudonymised before any AI call. Blur sits behind its own interface until vlincta's blur endpoint is known (`BLUR_DETECTOR`: `full` blurs the whole photo, `none` leaves photos waiting).

Citizen endpoints:

| Endpoint | What |
| --- | --- |
| `POST /uploads/suggest` `{ key }` | Category suggestion for an uploaded photo (US-14): `{ category, confidence, preselect }`. `preselect` is true from 0.80. Answers within about 3 s; on a timeout all three are `null`/`false` |
| `POST /reports` gains `suggestion: { category, confidence }` | The suggestion the citizen saw, logged as feedback when they chose another category (US-14) |
| `POST /reports/duplicates` `{ lat, lon, category, photoKey? }` | "Already reported?" (US-13): up to 3 public reports within 150 m in the same category group, most similar first: `{ matches: [{ publicId, category, status, distanceM, meTooCount, photo, similarity }] }` |
| `POST /reports/:publicId/co-report` `{ capture, photoKeys }` | "Add my photo to this report": same on-site rules as posting, within 150 m of the report; the citizen becomes a co-reporter and follows it (US-13). `201 { publicId }` |

Console endpoints:

| Endpoint | What |
| --- | --- |
| `GET /staff/reports/:publicId/duplicates` | Merge suggestions (US-17): same tenant, within 150 m, same category group, by photo similarity: `{ matches: [{ publicId, status, level, distanceM, similarity, createdAt }] }` |
| `GET /staff/hotspots?tenantId` | Clusters within 150 m and the same category group (US-50, US-52): `{ clusters: [{ id, group, lat, lon, count, level, publicIds, recurring, weekdayPattern }], computedAt }`; `level` is the highest inside; `weekdayPattern` is `mon`…`sun` or `null` |
| `GET /staff/trends?tenantId&weeks=8` | Weekly counts per category with the change against the 4-week average, and median hours to acknowledge and to resolve (US-51): `{ weeks, categories: [{ category, counts, fourWeekAverage, change }], medianHoursToAcknowledge, medianHoursToResolve }` |
| `GET /staff/briefings?tenantId` | The last 8 weekly briefings (US-53): `{ briefings: [{ id, tenant, weekStart, generatedAt, aiWritten, fallback, items: [{ id, level, kind, headline, text, citations, myRating }] }] }`; `kind` is `Urgent`, `Watch` or `Improving` |
| `POST /staff/briefings/items/:id/rating` `{ useful, note? }` | "Useful" / "Something is wrong" per item (US-54) |
| `PUT /staff/me/preferences` `{ briefingEmail }` | Unsubscribe from the Monday email (US-56); `GET /staff/me` returns `preferences` |
| `GET /staff/export/queue.csv?tenantId&from&to` · `GET /staff/export/trends.csv?tenantId` | CSV for council meetings (US-55) |

Moderation's `held` items gain `reason`: `blur_failed` or `too_large`. The worker processes new photos every minute, recomputes hotspots nightly, writes briefings Monday 06:00 and emails them to tenant admins at 07:00 Europe/Berlin (D-14, D-17).

## Maps

MapLibre on both clients (ENG-13): `maplibre-gl` on the web, `@maplibre/maplibre-react-native` in the app (needs an Expo dev build, not Expo Go). The style URL comes from `NEXT_PUBLIC_MAP_STYLE_URL` and `EXPO_PUBLIC_MAP_STYLE_URL`; development defaults to the public OpenFreeMap style. The production tile host is open (E-08).

## Not yet decided

- AI provider SDK: vlincta.com endpoint and models (D-13, D-15). The API calls it over HTTP; no package needed yet.
- Boundary import for tenants outside Berlin (BKG VG250) needs GDAL's `ogr2ogr`: `brew install gdal`. The script is not written yet.
