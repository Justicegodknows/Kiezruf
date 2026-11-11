# Kiezruf — Progress Report

> **Governing rule (GOV-01).** Every agent and every human collaborator reads this file in full
> **before writing code** and **again before committing**. Tooling enforces this at every level:
> the Claude Code hooks, the git `commit-msg` hook and the CI `progress-gate` check.
> Full rule: [AGENTS.md](AGENTS.md#gov-01--read-progressmd-first).
>
> How to acknowledge that you read it: run `pnpm progress:read` (humans, or any agent),
> or, in Claude Code, read this file in full with the Read tool.

**Last updated:** 2026-11-11 · **Phase:** 0, Setup (weeks 1–2) · **Overall:** schema v1, row-level security and the Berlin tenant seed exist and pass the isolation test locally; no endpoints or screens yet

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
| 1 · Citizen core | 3–8 | Not started | A citizen posts on iOS, Android and web; the report lands in the right tenant |
| 2 · Admin console | 7–12 | Not started | A case worker triages a Neukölln report end to end with no access to Spandau |
| 3 · Analysis and AI | 11–14 | Not started | The Monday briefing runs on staging with valid citations only |
| Gate · Pilot go-live | 15 | Not started | DPAs, DSFA, pen test, BITV audit and Q-07 contacts closed |
| 4 · Pilot (Neukölln + Spandau) | 15–26 | Not started | Pilot success targets measured |

## What exists in the repo

| Area | State |
| --- | --- |
| Monorepo | pnpm workspace with `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`. First commit `7afe4b0`. |
| `apps/api` | Fastify stub with `GET /health` only. No auth and no Kiezruf routes yet. |
| `apps/api` database | Schema v1 in `src/db/schema.ts`: `tenant`, `account`, `staff_role`, `report`, `photo`. Three migrations in `apps/api/drizzle`: extensions (PostGIS, ltree, pgvector), tables, tenant isolation (database roles, RLS policies, path triggers, `public_report` view). `pnpm --filter api db:migrate` and `db:seed`. |
| Tenant isolation | `withStaffScope` and `loadStaffScope` in `src/db/scope.ts` (US-42). `withCitizenAccess` reads only `public_report` and the tenant tree. Not wired to endpoints yet: that needs auth. |
| Tenant seed | `src/db/seed/tenants.ts`: Deutschland → Berlin (Land) → Berlin (Stadt) → 12 Bezirke with boundaries from Berlin open data. Neukölln and Spandau are pilot, the other 10 Bezirke not live. No tenants outside Berlin. |
| Routing | `routeTenant` in `src/db/routing.ts` (US-41, US-44), see ENG-06. Not called by any endpoint yet. |
| `apps/web` | Fresh Next.js template. No Kiezruf screens. |
| `apps/mobile` | Fresh Expo template. No Kiezruf screens. |
| `packages/shared` | `priorityScore` and `priorityLevel` (US-22, US-23), with 38 unit tests. 23 `it.todo` tests list the shared rules still to write (IDs, location gate, spike detection, briefing validation, pseudonymisation, forward links, votes). |
| `infra` | `docker-compose.yml` with PostgreSQL 16, MinIO and Mailpit. `infra/postgres/Dockerfile` builds the database image with PostGIS, ltree and pgvector (ENG-04). |
| Governance | GOV-01 progress gate: `PROGRESS.md`, `AGENTS.md`, hooks, CI check. 27 tests in `scripts/progress-gate.test.mjs`. |
| Tests | Vitest unit tests (shared, api, web). API integration tests via Testcontainers on the `infra/postgres` image (`apps/api/test/integration`): 30 tests run the real migrations and seed, 15 of them row-level security and citizen-access cases; 5 `it.todo` remain (3 staff endpoints, comment and vote rows, demand signal). The 8 Gherkin features from the engineering plan in `apps/api/features` (cucumber-js) and `apps/web/features` (playwright-bdd), tagged `@wip` with pending steps. Axe check for web pages. Jest (jest-expo) for mobile. Maestro flows in `apps/mobile/.maestro` (`wip`). |
| CI | `progress-gate` workflow, plus `ci` workflow: typecheck, lint, gate tests, unit with coverage, integration, features, axe, dependency audit. |

## In progress

| Item | Owner | Story / ref | Notes |
| --- | --- | --- | --- |
| Progress gate (GOV-01) | — | — | Done once a collaborator runs `pnpm install` (sets the hooks path) and CI runs on GitHub |
| First green `ci` run | — | — | Locally green on 2026-11-11: install, typecheck, lint, gate tests, unit tests, integration tests. Not run locally: cucumber features (cucumber-js refuses Node 25; CI uses Node 22), Playwright, dependency audit. The run on GitHub is still pending. |
| Tenant tree on staging | — | Phase 0 exit | The seed runs locally and in tests. Staging does not exist yet (E-03). |

## Next up (Phase 0, in order)

1. Auth with email one-time codes (US-01). Then wire `loadStaffScope` and `withStaffScope` into the first staff endpoints and turn the 3 staff-endpoint `it.todo` tests into real tests (US-42).
2. VG250 import script for tenants outside Berlin (needs `ogr2ogr`). Not needed for the pilot tenants.
3. Staging environment, then migrate and seed it (blocked by E-03). This closes the Phase 0 exit criterion.
4. Agree the vlincta.com API contract (E-01) and start the DPAs.
5. Product owner: confirm ENG-05 and ENG-06 below, and update the routing SQL in the engineering plan to match ENG-06.

## Blockers and open questions

| ID | Question | Blocks |
| --- | --- | --- |
| Q-07 | Which email addresses receive forwarded reports? | Pilot go-live (week 15) |
| Q-11 | Who funds Kiezruf after the pilot, and what do they require? | After pilot |
| E-01 | Which vlincta.com endpoints exist, and what are the SLA, rate limits and EU-region guarantees? | Phase 3 photo pipeline |
| E-02 | SMS one-time codes cost money per message. Do we offer email only during the pilot? | Phase 0 auth |
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

## Change log

Newest first. Add one line per commit that changes project state.

| Date | Change | By |
| --- | --- | --- |
| 2026-11-11 | Phase 0 items 1–3: schema v1 with three migrations, row-level security with database roles, Berlin tenant seed, routing query, `infra/postgres` image (ENG-04 to ENG-07). The row-level security, routing and pgvector `it.todo` tests are now real tests, except the 5 listed under *Tests*. Install fixes found on the way: `pnpm install` failed on three undecided build scripts (now denied in `pnpm-workspace.yaml`), mobile typecheck lacked jest types, web typecheck needed `next typegen`. | Claude |
| 2026-11-11 | Added the test suites and the `ci` workflow (see *Tests* above). Split `apps/api` into `app.ts` (buildApp) and `server.ts`. Fixed a gate bug found by the new tests: a new file in a new folder under a symlinked checkout path was not seen as inside the repo, so the edit was not blocked. | Claude |
| 2026-11-11 | Added `PROGRESS.md` and the GOV-01 progress gate (AGENTS.md, CLAUDE.md, git hooks, Claude Code hooks, CI) | Claude |
| 2026-11-11 | First commit: monorepo scaffold, API stub, shared score function, infra compose | — |

## How to update this file

- Update it in the same commit as the work. Move items between *Next up*, *In progress* and *What exists*, and add a change-log line.
- Keep it factual: what exists, what's next, what blocks. Plans and reasoning belong in the engineering plan.
- Editing this file changes its fingerprint, and every other collaborator must read it again before their next code change or commit. That is intended.
