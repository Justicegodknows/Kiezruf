# Kiezruf — Rules for every agent and collaborator

These rules apply to everyone who changes this repository: AI agents (Claude Code, Codex, Cursor, Copilot and others) and humans.
They apply in every app and package. Rules in a sub-folder's `AGENTS.md` (`apps/web`, `apps/mobile`) add to these rules and never override them.

## GOV-01 — Read PROGRESS.md first

**This is the governing principle of the project. No exceptions, no bypasses.**

1. **Before writing any code**, read [PROGRESS.md](PROGRESS.md) in full. This applies at the start of every session and every task, and again whenever the file has changed since you last read it.
2. **Before every commit**, read `PROGRESS.md` again and check that your change agrees with it.
3. **In the same commit as your work**, update `PROGRESS.md` when you change project state: move items, add a change-log line, record decisions and blockers.
4. Never skip or disable the enforcement: no `--no-verify`, no editing hooks or `core.hooksPath` to get around it, no fake `Progress-Read` trailers. A commit that bypasses the gate fails CI and will not be merged.
5. If `PROGRESS.md` conflicts with the product plan ([kiezruf-mvp-prototype.html](kiezruf-mvp-prototype.html)), the product plan wins. Fix `PROGRESS.md`, and tell the product owner if the conflict is new.

### How to record that you read it

| Who | How |
| --- | --- |
| Human, terminal | `pnpm progress:read` prints the file and records your read. `pnpm progress:check` shows whether your read is current. |
| Claude Code | Read `PROGRESS.md` in full with the Read tool, without `offset` or `limit`. A hook records it for this session. `pnpm progress:read` also works. |
| Any other agent | Run `pnpm progress:read` and read its output before writing code, and again before committing. |

### How it is enforced

| Level | Mechanism | What it blocks |
| --- | --- | --- |
| Agent session | Claude Code `PreToolUse` hook (`.claude/settings.json`) | `Edit`, `Write` and `NotebookEdit` on repo files, and `git commit`, until this session has read the current `PROGRESS.md` |
| Local commit | git `commit-msg` hook (`.githooks/`, enabled by `pnpm install`) | Any commit when your last read does not match the current or last committed `PROGRESS.md`. It stamps the commit with a `Progress-Read: <fingerprint>` trailer. |
| Remote | GitHub Actions `progress-gate` workflow on every push and PR | Any non-merge commit without a `Progress-Read` trailer that matches `PROGRESS.md` before or at that commit |
| Review | Pull-request reviewers | PRs that change project state without updating `PROGRESS.md` |

A read is recorded as a fingerprint of the file's contents. When anyone changes `PROGRESS.md`, every earlier read stops counting, so everyone has to read the new version. Read records live in `.progress/`, which is git-ignored and local to each checkout.

**Branch protection:** make `progress-gate` a required status check on `main` in the GitHub repository settings. Without it, CI only reports the problem and does not block the merge.

## Other project rules

- Product scope, stories and decisions come from [kiezruf-mvp-prototype.html](kiezruf-mvp-prototype.html). Engineering approach, Gherkin acceptance criteria and the Definition of Done come from the [engineering plan](https://claude.ai/artifact/HKL2joGnPhGD3yH7LspUmH).
- A story is done only when it meets the Definition of Done in the engineering plan.
- Tenant isolation is never weakened: every staff query runs inside the caller's tenant scope, and citizen endpoints never return score or level (US-24, US-42).
