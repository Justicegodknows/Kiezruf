# Kiezruf — Progress Report

> **Governing rule (GOV-01).** Every agent and every human collaborator reads this file in full
> **before writing code** and **again before committing**. Tooling enforces this at every level:
> the Claude Code hooks, the git `commit-msg` hook and the CI `progress-gate` check.
> Full rule: [AGENTS.md](AGENTS.md#gov-01--read-progressmd-first).
>
> How to acknowledge that you read it: run `pnpm progress:read` (humans, or any agent),
> or, in Claude Code, read this file in full with the Read tool.

**Last updated:** 2026-11-13 · **Phase:** 0, Setup (weeks 1–2) · **Overall:** scaffold plus web design system and screens on sample data; no backend features built

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
| `apps/api` | Fastify stub with `GET /health` only. Dependencies installed: Drizzle, pg-boss, S3 SDK, sharp, exifr, nodemailer, zod. No schema, no migrations, no routes. |
| `apps/web` | Design system and first screens, on **sample data** (`src/lib/sample-data.ts`, no API calls yet). Light and dark themes (follows the OS, toggle saved in `localStorage`, no flash). German and English under `/de/…` and `/en/…` (US-35); the proxy picks the saved choice, then `Accept-Language`, then German. Screens: home with map and nearby reports, report detail with Me too and status timeline (citizen view, no score or level, US-24), console with KPIs, trend and category charts, priority queue and score breakdown (US-22, US-23). Visual identity: paper and asphalt neutrals, tram green for links and active states, signal yellow only for the one primary action per screen (as in the product prototype); type is Barlow Condensed (headlines) and Barlow (UI and body); the home hero shows the newest reports as Berlin street-name plates. Axe: no serious or critical issues on all pages in both themes. |
| `apps/mobile` | Fresh Expo template. No Kiezruf screens. |
| `packages/shared` | `priorityScore` and `priorityLevel` (US-22, US-23), with 38 unit tests. 23 `it.todo` tests list the shared rules still to write (IDs, location gate, spike detection, briefing validation, pseudonymisation, forward links, votes). |
| `infra` | `docker-compose.yml` with PostGIS, MinIO and Mailpit. |
| Governance | GOV-01 progress gate: `PROGRESS.md`, `AGENTS.md`, hooks, CI check. 27 tests in `scripts/progress-gate.test.mjs`. |
| Tests | Vitest unit tests (shared, api, web). API integration tests on Postgres + PostGIS via Testcontainers (`apps/api/test/integration`). The 8 Gherkin features from the engineering plan in `apps/api/features` (cucumber-js) and `apps/web/features` (playwright-bdd), tagged `@wip` with pending steps. Axe check for web pages. Jest (jest-expo) for mobile. Maestro flows in `apps/mobile/.maestro` (`wip`). |
| CI | `progress-gate` workflow, plus `ci` workflow: typecheck, lint, gate tests, unit with coverage, integration, features, axe, dependency audit. |

## In progress

| Item | Owner | Story / ref | Notes |
| --- | --- | --- | --- |
| Progress gate (GOV-01) | — | — | Done once a collaborator runs `pnpm install` (sets the hooks path) and CI runs on GitHub |
| Test tooling install | — | — | New dev dependencies are in `package.json` files and `pnpm-lock.yaml` but not installed yet. Run `pnpm install`, then `pnpm test`. First green `ci` run on GitHub still pending. |

## Next up (Phase 0, in order)

1. Schema v1 in Drizzle: `tenant` (ltree path, boundary geometry), `account`, `staff_role`, `report`, `photo`. Enable the PostGIS, ltree and pgvector extensions. The `postgis/postgis` image has no pgvector (see E-05).
2. Row-level security policies; turn the `it.todo` tests in `apps/api/test/integration/tenant-isolation.int.test.ts` into real tests (US-42).
3. Tenant tree seed: Berlin → Neukölln and Spandau from Berlin open data; VG250 import script (needs `ogr2ogr`).
4. Auth with email one-time codes (US-01).
5. Agree the vlincta.com API contract (E-01) and start the DPAs.

## Blockers and open questions

| ID | Question | Blocks |
| --- | --- | --- |
| Q-07 | Which email addresses receive forwarded reports? | Pilot go-live (week 15) |
| Q-11 | Who funds Kiezruf after the pilot, and what do they require? | After pilot |
| E-01 | Which vlincta.com endpoints exist, and what are the SLA, rate limits and EU-region guarantees? | Phase 3 photo pipeline |
| E-02 | SMS one-time codes cost money per message. Do we offer email only during the pilot? | Phase 0 auth |
| E-03 | Which BSI C5 hosting provider (STACKIT, IONOS Cloud, Open Telekom Cloud)? | Staging environment |
| E-04 | Mobile map library: react-native-maps or MapLibre? | Phase 1 map |
| E-05 | Which Postgres image gives PostGIS, ltree and pgvector together, for local dev, Testcontainers and the hosting provider? | Schema v1, US-13 duplicates |

## Engineering decisions

| ID | Decision | Date |
| --- | --- | --- |
| GOV-01 | Everyone reads `PROGRESS.md` before writing code and before committing. Enforced by hooks and CI. | 2026-11-11 |
| ENG-01 | The ORM is Drizzle (already installed in `apps/api`). This replaces Kysely, which the engineering plan proposed. | 2026-11-11 |
| ENG-02 | Background jobs use pg-boss, so no Redis is needed. | 2026-11-11 |
| ENG-03 | Gherkin features live in `apps/*/features` and carry `@wip` until their story is built. CI runs every feature without `@wip` and fails on undefined or pending steps. Removing `@wip` is part of a story's Definition of Done. | 2026-11-11 |
| ENG-04 | Web i18n uses Next.js locale routing (`app/[lang]`) with typed dictionaries in `apps/web/src/i18n/dictionaries`. German is the source; a missing English key fails `tsc` and `i18n.test.ts`. `next-intl` stays installed but unused. Theme and language toggles keep pages statically prerendered. | 2026-11-13 |

## Change log

Newest first. Add one line per commit that changes project state.

| Date | Change | By |
| --- | --- | --- |
| 2026-11-13 | Branch `design`: visual identity pass. Signal-yellow primary action, Barlow type family, street-name plates in the hero, sentence case throughout, flat panels, console figures as one strip. | Claude |
| 2026-11-13 | Branch `design`: web design system, light and dark themes, DE/EN switch, home, report detail and console screens on sample data (see `apps/web` above, ENG-04). New web tests: i18n key parity, level chip, Me too toggle, citizen data never carries score or level. Axe list covers all pages in both themes. | Claude |
| 2026-11-11 | Added the test suites and the `ci` workflow (see *Tests* above). Split `apps/api` into `app.ts` (buildApp) and `server.ts`. Fixed a gate bug found by the new tests: a new file in a new folder under a symlinked checkout path was not seen as inside the repo, so the edit was not blocked. | Claude |
| 2026-11-11 | Added `PROGRESS.md` and the GOV-01 progress gate (AGENTS.md, CLAUDE.md, git hooks, Claude Code hooks, CI) | Claude |
| 2026-11-11 | First commit: monorepo scaffold, API stub, shared score function, infra compose | — |

## How to update this file

- Update it in the same commit as the work. Move items between *Next up*, *In progress* and *What exists*, and add a change-log line.
- Keep it factual: what exists, what's next, what blocks. Plans and reasoning belong in the engineering plan.
- Editing this file changes its fingerprint, and every other collaborator must read it again before their next code change or commit. That is intended.
