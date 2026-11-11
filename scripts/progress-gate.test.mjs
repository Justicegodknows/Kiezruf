// Tests for the GOV-01 progress gate (scripts/progress-gate.mjs). Node's built-in runner, no dependencies:
//   node --test scripts/
// Each test copies the script into a throwaway git repo, so the real .progress/ records are never touched.
import { strict as assert } from 'node:assert';
import { spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, test } from 'node:test';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'progress-gate.mjs');
let repo;

const git = (...args) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });

function gate(args, input) {
  const r = spawnSync(process.execPath, [join(repo, 'scripts', 'progress-gate.mjs'), ...args], {
    cwd: repo,
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const writeProgress = (text) => writeFileSync(join(repo, 'PROGRESS.md'), text);
const fileIn = (p) => join(repo, p);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'gov01-'));
  mkdirSync(join(repo, 'scripts'));
  copyFileSync(SCRIPT, join(repo, 'scripts', 'progress-gate.mjs'));
  writeProgress('# Progress\n\nversion 1\n');
  writeFileSync(join(repo, '.gitignore'), '.progress/\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('read and check', () => {
  test('check fails before anyone read the file', () => {
    const r = gate(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /not read PROGRESS\.md yet/);
  });

  test('read prints the file and records the read', () => {
    const r = gate(['read']);
    assert.equal(r.code, 0);
    assert.match(r.out, /version 1/);
    assert.equal(gate(['check']).code, 0);
  });

  test('a read stops counting once the file changes and is committed', () => {
    gate(['read']);
    writeProgress('# Progress\n\nversion 2\n');
    git('commit', '-q', '-am', 'change progress');
    const r = gate(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /changed since you last read it/);
  });

  test('a read of the working file still counts while the last committed version differs', () => {
    writeProgress('# Progress\n\nversion 2 (uncommitted)\n');
    gate(['read']);
    assert.equal(gate(['check']).code, 0);
  });

  test('CRLF and LF versions of the same text have the same fingerprint', () => {
    gate(['read']);
    writeProgress('# Progress\r\n\r\nversion 1\r\n');
    assert.equal(gate(['check']).code, 0);
  });

  test('read fails when PROGRESS.md is missing', () => {
    rmSync(fileIn('PROGRESS.md'));
    assert.equal(gate(['read']).code, 1);
  });

  test('an unknown command fails', () => {
    assert.equal(gate(['nope']).code, 1);
  });
});

describe('commit-msg hook', () => {
  test('blocks a commit when the file was not read', () => {
    writeFileSync(fileIn('MSG'), 'feat: something\n');
    const r = gate(['commit-msg', fileIn('MSG')]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Commit blocked/);
  });

  test('stamps a Progress-Read trailer after a read', () => {
    gate(['read']);
    writeFileSync(fileIn('MSG'), 'feat: something\n');
    assert.equal(gate(['commit-msg', fileIn('MSG')]).code, 0);
    const ack = readFileSync(fileIn('.progress/ack'), 'utf8').trim();
    assert.match(readFileSync(fileIn('MSG'), 'utf8'), new RegExp(`^Progress-Read: ${ack}$`, 'm'));
  });

  test('replaces an existing trailer instead of adding a second one', () => {
    gate(['read']);
    writeFileSync(fileIn('MSG'), 'feat: something\n\nProgress-Read: 000000000000\n');
    gate(['commit-msg', fileIn('MSG')]);
    const msg = readFileSync(fileIn('MSG'), 'utf8');
    assert.equal(msg.match(/Progress-Read:/g).length, 1);
    assert.doesNotMatch(msg, /000000000000/);
  });
});

describe('Claude Code PreToolUse hook', () => {
  const edit = (file, sid = 's1') => ({ tool_name: 'Edit', tool_input: { file_path: fileIn(file) }, session_id: sid });

  test('blocks an edit inside the repo with exit code 2 before the session read the file', () => {
    const r = gate(['hook-pre'], edit('src/app.ts'));
    assert.equal(r.code, 2);
    assert.match(r.err, /\[GOV-01\]/);
  });

  test('allows editing PROGRESS.md itself', () => {
    assert.equal(gate(['hook-pre'], edit('PROGRESS.md')).code, 0);
  });

  test('allows edits outside the repo', () => {
    const outside = { tool_name: 'Write', tool_input: { file_path: join(tmpdir(), 'elsewhere.txt') }, session_id: 's1' };
    assert.equal(gate(['hook-pre'], outside).code, 0);
  });

  test('blocks a Bash git commit before the session read the file', () => {
    const r = gate(['hook-pre'], { tool_name: 'Bash', tool_input: { command: 'git add . && git commit -m x' }, session_id: 's1' });
    assert.equal(r.code, 2);
  });

  test('blocks git commit with options before the subcommand', () => {
    const r = gate(['hook-pre'], { tool_name: 'Bash', tool_input: { command: 'git -C . commit -m x' }, session_id: 's1' });
    assert.equal(r.code, 2);
  });

  test('lets other Bash commands through', () => {
    assert.equal(gate(['hook-pre'], { tool_name: 'Bash', tool_input: { command: 'git status' }, session_id: 's1' }).code, 0);
  });

  test("another session's read does not count for this session", () => {
    gate(['hook-post'], { tool_name: 'Read', tool_input: { file_path: fileIn('PROGRESS.md') }, session_id: 'other' });
    assert.equal(gate(['hook-pre'], edit('src/app.ts', 's1')).code, 2);
  });
});

describe('Claude Code PostToolUse hook', () => {
  const read = (extra = {}, sid = 's1') => ({ tool_name: 'Read', tool_input: { file_path: fileIn('PROGRESS.md'), ...extra }, session_id: sid });
  const editApp = () => ({ tool_name: 'Edit', tool_input: { file_path: fileIn('src/app.ts') }, session_id: 's1' });

  test('a full Read unlocks edits for that session', () => {
    gate(['hook-post'], read());
    assert.equal(gate(['hook-pre'], editApp()).code, 0);
  });

  test('a partial Read (offset or limit) does not count', () => {
    gate(['hook-post'], read({ limit: 20 }));
    assert.equal(gate(['hook-pre'], editApp()).code, 2);
    gate(['hook-post'], read({ offset: 10 }));
    assert.equal(gate(['hook-pre'], editApp()).code, 2);
  });

  test('running pnpm progress:read through Bash counts', () => {
    gate(['hook-post'], { tool_name: 'Bash', tool_input: { command: 'pnpm progress:read' }, session_id: 's1' });
    assert.equal(gate(['hook-pre'], editApp()).code, 0);
  });

  test('a session read stops counting when PROGRESS.md changes', () => {
    gate(['hook-post'], read());
    writeProgress('# Progress\n\nversion 2\n');
    assert.equal(gate(['hook-pre'], editApp()).code, 2);
  });

  test('records nothing without a session id', () => {
    gate(['hook-post'], { tool_name: 'Read', tool_input: { file_path: fileIn('PROGRESS.md') } });
    assert.equal(existsSync(fileIn('.progress/ack')), false);
  });
});

describe('CI check', () => {
  const base = () => git('rev-parse', 'HEAD').trim();
  const commitWith = (trailer) => {
    writeFileSync(fileIn(`f-${Math.random()}`), 'x');
    git('add', '.');
    git('commit', '-q', '-m', trailer ? `change\n\nProgress-Read: ${trailer}` : 'change');
  };

  test('passes when every commit carries a matching trailer', () => {
    const b = base();
    gate(['read']);
    commitWith(readFileSync(fileIn('.progress/ack'), 'utf8').trim());
    const r = gate(['ci', b]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /1 commit\(s\) checked/);
  });

  test('fails a commit without a trailer', () => {
    const b = base();
    commitWith(null);
    const r = gate(['ci', b]);
    assert.equal(r.code, 1);
    assert.match(r.err, /no Progress-Read trailer/);
  });

  test('fails a commit whose trailer does not match PROGRESS.md', () => {
    const b = base();
    commitWith('abcdefabcdef');
    const r = gate(['ci', b]);
    assert.equal(r.code, 1);
    assert.match(r.err, /does not match/);
  });

  test('accepts the pre-change fingerprint on the commit that edits PROGRESS.md', () => {
    const b = base();
    gate(['read']);
    const before = readFileSync(fileIn('.progress/ack'), 'utf8').trim();
    writeProgress('# Progress\n\nversion 2\n');
    git('add', '.');
    git('commit', '-q', '-m', `update progress\n\nProgress-Read: ${before}`);
    assert.equal(gate(['ci', b]).code, 0);
  });

  test('fails with a clear message for an unknown base ref', () => {
    const r = gate(['ci', 'no-such-ref']);
    assert.equal(r.code, 1);
    assert.match(r.err, /Cannot list commits/);
  });
});
