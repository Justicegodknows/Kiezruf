@AGENTS.md

## Claude Code specifics

- First action in every session, before any edit: Read `PROGRESS.md` in full (no `offset`/`limit`). The PreToolUse hook blocks edits and `git commit` until you do, and again whenever the file changes.
- Before every commit: Read `PROGRESS.md` again, update it if your work changed project state, then commit.
- If a hook blocks you with `[GOV-01]`, do what it says. Never try to work around it.
