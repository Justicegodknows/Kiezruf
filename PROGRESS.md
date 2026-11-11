# Kiezruf — Progress Report

> **Governing rule (GOV-01).** Every agent and every human collaborator reads this file in full
> **before writing code** and **again before committing**. Tooling enforces this at every level:
> the Claude Code hooks, the git `commit-msg` hook and the CI `progress-gate` check.
> Full rule: [AGENTS.md](AGENTS.md#gov-01--read-progressmd-first).
>
> How to acknowledge that you read it: run `pnpm progress:read` (humans, or any agent),
> or, in Claude Code, read this file in full with the Read tool.

**Last updated:** 2026-11-11 · **Phase:** 0, Setup (weeks 1–2) · **Overall:** scaffold only, no features built

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
| `apps/web` | Fresh Next.js template. No Kiezruf screens. |
| `apps/mobile` | Fresh Expo template. No Kiezruf screens. |
| `packages/shared` | `priorityScore` and `priorityLevel` (US-22, US-23). No tests yet. |
| `infra` | `docker-compose.yml` with PostGIS, MinIO and Mailpit. |
| Governance | GOV-01 progress gate: `PROGRESS.md`, `AGENTS.md`, hooks, CI check. |
| CI | Only the `progress-gate` workflow. No typecheck or test pipeline yet. |

## In progress

| Item | Owner | Story / ref | Notes |
| --- | --- | --- | --- |
| Progress gate (GOV-01) | — | — | Done once a collaborator runs `pnpm install` (sets the hooks path) and CI runs on GitHub |

## Next up (Phase 0, in order)

1. CI pipeline: typecheck, lint, Vitest on every PR.
2. Schema v1 in Drizzle: `tenant` (ltree path, boundary geometry), `account`, `staff_role`, `report`, `photo`. Enable the PostGIS, ltree and pgvector extensions.
3. Row-level security policies and the cross-tenant isolation test (US-42).
4. Tenant tree seed: Berlin → Neukölln and Spandau from Berlin open data; VG250 import script (needs `ogr2ogr`).
5. Auth with email one-time codes (US-01).
6. Unit tests for `priorityScore` and `priorityLevel`.
7. Agree the vlincta.com API contract (E-01) and start the DPAs.

## Blockers and open questions

| ID | Question | Blocks |
| --- | --- | --- |
| Q-07 | Which email addresses receive forwarded reports? | Pilot go-live (week 15) |
| Q-11 | Who funds Kiezruf after the pilot, and what do they require? | After pilot |
| E-01 | Which vlincta.com endpoints exist, and what are the SLA, rate limits and EU-region guarantees? | Phase 3 photo pipeline |
| E-02 | SMS one-time codes cost money per message. Do we offer email only during the pilot? | Phase 0 auth |
| E-03 | Which BSI C5 hosting provider (STACKIT, IONOS Cloud, Open Telekom Cloud)? | Staging environment |
| E-04 | Mobile map library: react-native-maps or MapLibre? | Phase 1 map |

## Engineering decisions

| ID | Decision | Date |
| --- | --- | --- |
| GOV-01 | Everyone reads `PROGRESS.md` before writing code and before committing. Enforced by hooks and CI. | 2026-11-11 |
| ENG-01 | The ORM is Drizzle (already installed in `apps/api`). This replaces Kysely, which the engineering plan proposed. | 2026-11-11 |
| ENG-02 | Background jobs use pg-boss, so no Redis is needed. | 2026-11-11 |

## Change log

Newest first. Add one line per commit that changes project state.

| Date | Change | By |
| --- | --- | --- |
| 2026-11-11 | Added `PROGRESS.md` and the GOV-01 progress gate (AGENTS.md, CLAUDE.md, git hooks, Claude Code hooks, CI) | Claude |
| 2026-11-11 | First commit: monorepo scaffold, API stub, shared score function, infra compose | — |

## How to update this file

- Update it in the same commit as the work. Move items between *Next up*, *In progress* and *What exists*, and add a change-log line.
- Keep it factual: what exists, what's next, what blocks. Plans and reasoning belong in the engineering plan.
- Editing this file changes its fingerprint, and every other collaborator must read it again before their next code change or commit. That is intended.
