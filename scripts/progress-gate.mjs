#!/usr/bin/env node
// GOV-01 progress gate: nobody writes code or commits without having read the current PROGRESS.md.
// One script, used by every enforcement point:
//   node scripts/progress-gate.mjs read                 print PROGRESS.md and record that you read it (pnpm progress:read)
//   node scripts/progress-gate.mjs check                exit 1 unless your last read matches the current file
//   node scripts/progress-gate.mjs commit-msg <file>    git commit-msg hook: check, then stamp a Progress-Read trailer
//   node scripts/progress-gate.mjs hook-pre             Claude Code PreToolUse hook (blocks edits/commits; exit 2)
//   node scripts/progress-gate.mjs hook-post            Claude Code PostToolUse hook (records a full Read of PROGRESS.md)
//   node scripts/progress-gate.mjs ci <base-ref>        CI: every non-merge commit in <base-ref>..HEAD carries a valid trailer
// A "read" is recorded as a fingerprint (first 12 hex of SHA-256) of PROGRESS.md. When the file changes, the old read
// no longer counts, so everyone must read the new version.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'PROGRESS.md');
const ACK_DIR = join(ROOT, '.progress');
const ACK = join(ACK_DIR, 'ack');
const TRAILER = 'Progress-Read';
const HOW = 'Run `pnpm progress:read` (or, in Claude Code, Read PROGRESS.md in full with no offset/limit).';

const fingerprint = (text) =>
  text == null ? 'none' : createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const current = () => fingerprint(readText(FILE));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const atRev = (rev) => { try { return fingerprint(git('show', `${rev}:PROGRESS.md`)); } catch { return null; } };
const sessionAck = (id) => join(ACK_DIR, `session-${String(id).replace(/[^\w-]/g, '')}`);

function record(paths) {
  mkdirSync(ACK_DIR, { recursive: true });
  const fp = current();
  for (const p of paths) writeFileSync(p, fp + '\n');
  return fp;
}
const ackOf = (p) => (readText(p) ?? '').trim();

// A human/agent read is valid if it matches the working file or the last committed version.
function checkAck() {
  const ack = ackOf(ACK);
  const valid = new Set([current(), atRev('HEAD')].filter(Boolean));
  if (!ack) return { ok: false, why: 'You have not read PROGRESS.md yet.' };
  if (!valid.has(ack)) return { ok: false, why: 'PROGRESS.md changed since you last read it.' };
  return { ok: true, ack };
}

function fail(msg, code = 1) {
  process.stderr.write(`\n[GOV-01] ${msg}\n${HOW}\n\n`);
  process.exit(code);
}

// Compare real paths, so symlinked checkouts (e.g. /tmp -> /private/tmp) cannot slip past the gate.
// A path that does not exist yet (a new file in a new folder) is resolved through its nearest existing ancestor.
const canon = (p) => {
  const abs = resolve(ROOT, p);
  const rest = [];
  let dir = abs;
  for (;;) {
    try { return join(realpathSync(dir), ...rest); } catch {}
    const parent = dirname(dir);
    if (parent === dir) return abs;
    rest.unshift(basename(dir));
    dir = parent;
  }
};
const REAL_ROOT = canon(ROOT);
const isProgressFile = (p) => !!p && canon(p) === canon(FILE);
const insideRepo = (p) => !!p && (canon(p) + '/').startsWith(REAL_ROOT + '/');
const COMMIT_RE = /(^|[;&|(\s])git\s+(-\S+\s+(\S+\s+)?)*commit\b/;
const READ_CMD_RE = /progress:read|progress-gate\.mjs\s+read/;

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case 'read': {
    const text = readText(FILE);
    if (text == null) fail('PROGRESS.md is missing at the repo root.');
    process.stdout.write(text);
    const fp = record([ACK]);
    process.stderr.write(`\n[GOV-01] Recorded: you read PROGRESS.md (${fp}).\n`);
    break;
  }

  case 'check': {
    const r = checkAck();
    if (!r.ok) fail(r.why);
    process.stdout.write(`[GOV-01] OK: PROGRESS.md read (${r.ack}).\n`);
    break;
  }

  case 'commit-msg': {
    const r = checkAck();
    if (!r.ok) fail(`Commit blocked. ${r.why} Read it before committing.`);
    execFileSync('git', ['interpret-trailers', '--in-place', '--if-exists', 'replace', '--trailer', `${TRAILER}: ${r.ack}`, arg], { cwd: ROOT });
    break;
  }

  case 'hook-pre': {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const { tool_name: tool, tool_input: ti = {}, session_id: sid } = input;
    const sessionOk = () => ackOf(sessionAck(sid)) === current();
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
      const p = ti.file_path ?? ti.notebook_path;
      if (isProgressFile(p) || !insideRepo(p)) break; // editing PROGRESS.md itself, or files outside the repo
      if (!sessionOk()) fail(`Edit to ${p} blocked: this session has not read the current PROGRESS.md.`, 2);
    } else if (tool === 'Bash' && COMMIT_RE.test(ti.command ?? '')) {
      if (!sessionOk()) fail('git commit blocked: read the current PROGRESS.md again before committing.', 2);
    }
    break;
  }

  case 'hook-post': {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const { tool_name: tool, tool_input: ti = {}, session_id: sid } = input;
    const full = ti.offset == null && ti.limit == null;
    const readIt = tool === 'Read' && isProgressFile(ti.file_path) && full;
    const wroteIt = ['Edit', 'Write', 'MultiEdit'].includes(tool) && isProgressFile(ti.file_path);
    const ranRead = tool === 'Bash' && READ_CMD_RE.test(ti.command ?? '');
    if (sid && (readIt || wroteIt || ranRead)) record([sessionAck(sid), ACK]);
    break;
  }

  case 'ci': {
    const base = arg ?? 'origin/main';
    let commits;
    try { commits = git('rev-list', '--no-merges', `${base}..HEAD`).split('\n').filter(Boolean); }
    catch { fail(`Cannot list commits in ${base}..HEAD. Fetch full history (fetch-depth: 0).`); }
    const bad = [];
    for (const c of commits) {
      const msg = git('log', '-1', '--format=%B', c);
      const m = msg.match(new RegExp(`^${TRAILER}:\\s*([0-9a-f]{12})\\s*$`, 'm'));
      const valid = new Set([atRev(`${c}^`), atRev(c)].filter(Boolean));
      if (!m) bad.push(`${c.slice(0, 8)}  no ${TRAILER} trailer (hooks skipped? run \`pnpm install\` to enable them)`);
      else if (!valid.has(m[1])) bad.push(`${c.slice(0, 8)}  ${TRAILER}: ${m[1]} does not match PROGRESS.md before or at this commit`);
    }
    if (bad.length) fail(`${bad.length} of ${commits.length} commit(s) were made without reading the current PROGRESS.md:\n  ${bad.join('\n  ')}`);
    process.stdout.write(`[GOV-01] OK: ${commits.length} commit(s) checked.\n`);
    break;
  }

  default:
    fail(`Unknown command "${cmd ?? ''}". Use read | check | commit-msg | hook-pre | hook-post | ci.`);
}
