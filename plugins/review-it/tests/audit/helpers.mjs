// Shared helpers for the audit-chain tests. Each test copies a fixture folder to a temp dir and drives
// scripts/audit-chain.mjs as a host would: run a command, read the DISPATCH line, record a file.
import { mkdtempSync, cpSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CHAIN = join(here, '../../scripts/audit-chain.mjs');
export const FIX = join(here, '../fixtures/audit');
// The review-it repo this suite runs in: the fixtures cite its real commits (eed4dec, ca86985), and
// the chain verifies every cited sha with `git cat-file -e` (CP-03 Q1-M1).
export const REPO = spawnSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
if (!REPO || spawnSync('git', ['-C', REPO, 'cat-file', '-e', 'eed4dec'], { encoding: 'utf8' }).status !== 0)
  throw new Error(`audit tests need a full review-it git checkout (commit eed4dec); got "${REPO}"`);
export const REPOS = ['--repos', `review-it=${REPO}`];

const made = [];
export function tmp(prefix = 'rev-audit-') { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; }
export function cleanup() { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); }

// A fixture folder copied to a temp dir, plus an empty HOME so no installed plugin leaks in.
export function workspace(name) {
  const dir = tmp();
  cpSync(join(FIX, name), dir, { recursive: true });
  return { dir, home: tmp('rev-home-'), ledger: join(dir, 'claims.md') };
}

// env: only what the case sets. DOC_IT_CLI is passed through when the caller asks for doc-it.
export function run(args, { cwd, home, env = {} } = {}) {
  const base = { PATH: process.env.PATH, HOME: home || tmp('rev-home-') };
  const r = spawnSync(process.execPath, [CHAIN, ...args], { cwd, encoding: 'utf8', env: { ...base, ...env } });
  const dispatches = (r.stdout || '').split('\n').filter((l) => l.startsWith('DISPATCH ')).map((l) => JSON.parse(l.slice(9)));
  return { ...r, dispatches };
}
export const state = (ws) => JSON.parse(readFileSync(join(ws.dir, 'audit', 'chain-state.json'), 'utf8'));
export const exists = (ws, rel) => existsSync(join(ws.dir, rel));
export const read = (ws, rel) => readFileSync(join(ws.dir, rel), 'utf8');
export const states = (st) => st.history.map((h) => h.to);
