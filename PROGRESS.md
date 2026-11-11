# Kiezruf — Progress Report

> **Governing rule (GOV-01).** Every agent and every human collaborator reads this file in full
> **before writing code** and **again before committing**. Tooling enforces this at every level:
> the Claude Code hooks, the git `commit-msg` hook and the CI `progress-gate` check.
> Full rule: [AGENTS.md](AGENTS.md#gov-01--read-progressmd-first).
>
> How to acknowledge that you read it: run `pnpm progress:read` (humans, or any agent),
> or, in Claude Code, read this file in full with the Read tool.

**Last updated:** 2026-11-11 · **Phase:** 0 (Setup) and 1 (Citizen core) · **Overall:** the citizen API exists (sign-in, posting, browsing, Me too) and passes locally; no app or web screens yet

## Sources of truth

| What | Where |
| --- | --- |
| Product scope, stories US-01…US-56, decisions D-01…D-17 | [kiezruf-mvp-prototype.html](kiezruf-mvp-prototype.html) |
| Engineering plan: architecture, data model, Gherkin AC, Definition of Done | [Kiezruf — Engineering Plan](https://claude.ai/artifact/HKL2joGnPhGD3yH7LspUmH) |
| This file: current state, what's next, blockers | `PROGRESS.md` |

If this file conflicts with the product plan, the product plan wins. Fix this file in the same commit.

## Phase status

| Phase | Weeks | Status | Exit criterion |
| --- | --- | --- | --- |
| 0 · Setup, DPAs, boundaries | 1–2 | In progress | A seeded tenant tree on staging; the RLS isolation test passes |
| 1 · Citizen core | 3–8 | In progress | A citizen posts on iOS, Android and web; the report lands in the right tenant |
| 2 · Admin console | 7–12 | Not started | A case worker triages a Neukölln report end to end with no access to Spandau |
| 3 · Analysis and AI | 11–14 | Not started | The Monday briefing runs on staging with valid citations only |
| Gate · Pilot go-live | 15 | Not started | DPAs, DSFA, pen test, BITV audit and Q-07 contacts closed |
| 4 · Pilot (Neukölln + Spandau) | 15–26 | Not started | Pilot success targets measured |

## What exists in the repo

| Area | State |
| --- | --- |
| Monorepo | pnpm workspace with `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`. First commit `7afe4b0`. |
| `apps/api` | Citizen API: email one-time-code sign-in and sessions (US-01), photo upload URLs, posting with the on-site gate and routing (US-03, US-06, US-08, US-10, US-41, US-44), My reports (US-11), public map, list and detail (US-15, US-24), Me too (US-18). Endpoint list in `README.md`. No staff endpoints, no OpenAPI spec yet. |
| `apps/api` database | Schema v1 in `src/db/schema.ts`: `tenant`, `account`, `staff_role`, `report`, `photo`. Phase 1 adds `login_code`, `session`, `report_sequence`, `demand_signal`, `reaction`. Five migrations in `apps/api/drizzle`: extensions, tables, tenant isolation (0002), Phase 1 tables (0003), citizen and sign-in access (0004: roles, policies, `public_report` with Me too count, `public_photo`). `pnpm --filter api db:migrate` and `db:seed`. |
| Tenant isolation | Every API query runs under a database role (ENG-05, ENG-08): `withStaffScope`, `withCitizenSession`, `withCitizenAccess`, `withAuthAccess` in `src/db/scope.ts`. Citizen routes use them; no staff endpoint exists yet. |
| Tenant seed | `src/db/seed/tenants.ts`: Deutschland → Berlin (Land) → Berlin (Stadt) → 12 Bezirke with boundaries from Berlin open data. Neukölln and Spandau are pilot, the other 10 Bezirke not live. No tenants outside Berlin. |
| Routing | `routeTenant` in `src/db/routing.ts` (ENG-06), used by `POST /reports` and `GET /public/route`. Not-live attempts are stored as demand signals without account or location. |
| `apps/web` | Fresh Next.js template. No Kiezruf screens. |
| `apps/mobile` | Fresh Expo template. No Kiezruf screens. |
| `packages/shared` | One ES module (ENG-11): priority score and levels (US-22, US-23), report IDs (US-41), on-site gate and limits (US-03, US-06, US-10, D-03), default categories (US-08). 63 unit tests. 15 `it.todo` tests list the rules still to write (spike detection, briefing validation, pseudonymisation, forward links). |
| `infra` | `docker-compose.yml` with PostgreSQL 16, MinIO and Mailpit. `infra/postgres/Dockerfile` builds the database image with PostGIS, ltree and pgvector (ENG-04). |
| Governance | GOV-01 progress gate: `PROGRESS.md`, `AGENTS.md`, hooks, CI check. 27 tests in `scripts/progress-gate.test.mjs`. |
| Tests | Vitest unit tests (shared, api, web). API integration tests via Testcontainers on the `infra/postgres` image (`apps/api/test/integration`): 75 tests on the real migrations and seed, covering isolation, sign-in, posting, browsing, Me too and citizen row-level security; 86 % statement coverage of `apps/api/src` (ENG-12); 4 `it.todo` remain (3 staff endpoints, comment rows). The 8 Gherkin features from the engineering plan in `apps/api/features` (cucumber-js) and `apps/web/features` (playwright-bdd): `routing.feature` runs for real against a test database (4 scenarios); the other 7 stay `@wip` with pending steps. Axe check for web pages. Jest (jest-expo) for mobile. Maestro flows in `apps/mobile/.maestro` (`wip`). |
| CI | `progress-gate` workflow, plus `ci` workflow: typecheck, lint, gate tests, unit with coverage, integration, features, axe, dependency audit. |

## In progress

| Item | Owner | Story / ref | Notes |
| --- | --- | --- | --- |
| Progress gate (GOV-01) | — | — | Done once a collaborator runs `pnpm install` (sets the hooks path) and CI runs on GitHub |
| First green `ci` run | — | — | Locally green on 2026-11-11: install, typecheck, lint, gate tests, unit tests, integration tests, API Gherkin features (run through Cucumber's JavaScript API, because the CLI refuses Node 25; CI uses Node 22 and the CLI). Not run locally: Playwright, dependency audit. The run on GitHub is still pending. |
| Tenant tree on staging | — | Phase 0 exit | The seed runs locally and in tests. Staging does not exist yet (E-03). |
| Citizen core | — | Phase 1 | API slice done (see *What exists*). Left: comments (US-19), follow (US-20), notifications (US-29), "tell me when it starts here" (US-44), and every screen in the app and the citizen web. |

## Next up (in order)

1. Citizen API, rest of Phase 1: comments with the 500-character limit, flag and offensive-language hold (US-19), follow with auto-follow for reporters and voters (US-20), notification settings and push tokens (US-29), "tell me when it starts here" (US-44). The comment table must follow the report scope for staff (open `it.todo`).
2. Mobile app screens on the citizen API: sign-in sheet, camera, compose, review, not live, map and list, detail with Me too (needs E-04 for the map).
3. Citizen web screens, with sessions in httpOnly cookies instead of bearer tokens (engineering plan, Sessions).
4. Phase 0 leftovers: staging (E-03), then migrate and seed it; VG250 import for tenants outside Berlin; vlincta.com contract (E-01) and DPAs.
5. Product owner: confirm ENG-05, ENG-06 and the parameters in ENG-10, and update the routing SQL in the engineering plan to match ENG-06.
6. Phase 3 photo job, when it is built: cap upload size (presigned PUT does not), and check the EXIF location and time of each original against the declared capture (the API trusts the client's values until then).

## Blockers and open questions

| ID | Question | Blocks |
| --- | --- | --- |
| Q-07 | Which email addresses receive forwarded reports? | Pilot go-live (week 15) |
| Q-11 | Who funds Kiezruf after the pilot, and what do they require? | After pilot |
| E-01 | Which vlincta.com endpoints exist, and what are the SLA, rate limits and EU-region guarantees? | Phase 3 photo pipeline |
| E-02 | SMS one-time codes cost money per message. Do we offer email only during the pilot? Email sign-in is built; phone sign-in waits for this answer. | Phone sign-in |
| E-03 | Which BSI C5 hosting provider (STACKIT, IONOS Cloud, Open Telekom Cloud)? Its PostgreSQL must offer PostGIS, ltree and pgvector, and a login role for the API that is not the table owner (ENG-05). | Staging environment |
| E-04 | Mobile map library: react-native-maps or MapLibre? | Phase 1 map |
| E-06 | Under which licence does Geoportal Berlin publish the Bezirk boundaries, and what attribution must the apps show? | Pilot go-live |
| E-07 | Embedding size for `photo.embedding`. The column has no fixed dimension until the vlincta.com model is known (part of E-01). | US-13 similarity index |

## Engineering decisions

| ID | Decision | Date |
| --- | --- | --- |
| GOV-01 | Everyone reads `PROGRESS.md` before writing code and before committing. Enforced by hooks and CI. | 2026-11-11 |
| ENG-01 | The ORM is Drizzle (already installed in `apps/api`). This replaces Kysely, which the engineering plan proposed. | 2026-11-11 |
| ENG-02 | Background jobs use pg-boss, so no Redis is needed. | 2026-11-11 |
| ENG-03 | Gherkin features live in `apps/*/features` and carry `@wip` until their story is built. CI runs every feature without `@wip` and fails on undefined or pending steps. Removing `@wip` is part of a story's Definition of Done. | 2026-11-11 |
| ENG-04 | Local dev and CI use one database image, built in `infra/postgres`: `pgvector/pgvector:0.8.0-pg16` plus the `postgresql-16-postgis-3` package. This answers E-05 for local dev and Testcontainers; the hosting side moved into E-03. `postgis/postgis:16-3.4` was dropped: it has no arm64 build and its apt repository is gone. | 2026-11-11 |
| ENG-05 | Tenant isolation in Postgres uses two database roles. `kiezruf_staff` reads reports where `tenant_path` is inside `app.scope_paths` and may change only `status` of reports whose tenant is in `app.write_paths`. `kiezruf_citizen` reads only the `public_report` view. Reading inherits down the tree. Changing a report needs a non-viewer role at the tenant that owns it, following the product plan ("Only the owner edits. Higher levels read and roll up."). So a tenant admin at Berlin level cannot change a Neukölln report. | 2026-11-11 |
| ENG-06 | Routing picks the deepest tenant whose boundary covers the point, and that tenant must be pilot or live; otherwise the answer is "not live here yet". The engineering plan's SQL filters by status first, which would send a report from a not-live Bezirk to the live city above it and contradict US-44 and `routing.feature`. | 2026-11-11 |
| ENG-07 | `report.location` is the public map position. `capture_location`, `capture_accuracy_m` and `capture_at` are private and are not in `public_report`. The engineering plan lists one location column. | 2026-11-11 |
| ENG-08 | Every API query runs under one of three database roles: `kiezruf_auth` (sign-in bookkeeping before the caller is known), `kiezruf_citizen` (public views; with `app.account_id` set, the citizen's own account, reports and votes, and posting as `processing` only) and `kiezruf_staff` (ENG-05). Report numbers come from a `SECURITY DEFINER` function, so citizens never touch `report_sequence`. In staging and production the API's login role gets the three roles `WITH INHERIT FALSE`. | 2026-11-11 |
| ENG-09 | Sessions are opaque random tokens, stored as SHA-256 hashes, sent as `Authorization: Bearer`. Citizens get 30 days. Sign-in codes are stored as HMACs keyed with `AUTH_SECRET`. No staff sessions are issued yet: staff need a second factor (passkey or TOTP) first. `@fastify/jwt` is installed but unused. | 2026-11-11 |
| ENG-10 | Parameters the product plan leaves open, to be confirmed: Me too counts as on-site within 150 m of the report (the duplicate-check radius); a report needs at least 1 photo; descriptions up to 1000 characters; 5 sign-in codes per address per hour; capture times up to 5 minutes in the future are accepted (clock skew). | 2026-11-11 |
| ENG-11 | `packages/shared` is one ES module (`"type": "module"`, a single `index.ts`). Node needs ESM to see its named exports, and relative imports inside the package would need file extensions that tsc NodeNext, Next and Metro do not agree on. | 2026-11-11 |
| ENG-12 | API coverage is measured on the integration tests (`pnpm --filter api test:int:coverage`, the CI integration job), because most API code needs a database. The unit-test figure for `apps/api` is no longer the one to watch. | 2026-11-11 |

## Change log

Newest first. Add one line per commit that changes project state.

| Date | Change | By |
| --- | --- | --- |
| 2026-11-11 | Phase 1 started with the citizen API: sign-in, uploads, posting, My reports, public map and detail, Me too, demand signals (ENG-08 to ENG-12). `routing.feature` no longer `@wip`. Fixed on the way: `packages/shared` was not loadable as ESM at runtime (the dev server would have failed). | Claude |
| 2026-11-11 | Phase 0 items 1–3: schema v1 with three migrations, row-level security with database roles, Berlin tenant seed, routing query, `infra/postgres` image (ENG-04 to ENG-07). The row-level security, routing and pgvector `it.todo` tests are now real tests, except the 5 listed under *Tests*. Install fixes found on the way: `pnpm install` failed on three undecided build scripts (now denied in `pnpm-workspace.yaml`), mobile typecheck lacked jest types, web typecheck needed `next typegen`. | Claude |
| 2026-11-11 | Added the test suites and the `ci` workflow (see *Tests* above). Split `apps/api` into `app.ts` (buildApp) and `server.ts`. Fixed a gate bug found by the new tests: a new file in a new folder under a symlinked checkout path was not seen as inside the repo, so the edit was not blocked. | Claude |
| 2026-11-11 | Added `PROGRESS.md` and the GOV-01 progress gate (AGENTS.md, CLAUDE.md, git hooks, Claude Code hooks, CI) | Claude |
| 2026-11-11 | First commit: monorepo scaffold, API stub, shared score function, infra compose | — |

## How to update this file

- Update it in the same commit as the work. Move items between *Next up*, *In progress* and *What exists*, and add a change-log line.
- Keep it factual: what exists, what's next, what blocks. Plans and reasoning belong in the engineering plan.
- Editing this file changes its fingerprint, and every other collaborator must read it again before their next code change or commit. That is intended.
