// node --test plugins/review-it/tests
// Fixture implementation: T-01 reviewed PASS, T-02 reviewed FAIL. Asserts the status.json afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SYNC = join(here, '../scripts/status-sync.mjs');
const WRITER = process.env.STATUS_WRITE || join(homedir(), 'Workspace/Devotts/build-it/plugins/build-it/scripts/status/status-write.mjs');
const skip = existsSync(WRITER) ? false : 'status-write.mjs not found (set STATUS_WRITE)';

const node = (args, cwd) => spawnSync('node', args, { cwd, encoding: 'utf8' });

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'rev-sync-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const dir = join(repo, 'docs/implementations/demo');
  mkdirSync(join(dir, 'review'), { recursive: true });
  writeFileSync(join(repo, 'plan.json'), JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'w', tasks: [{ id: 'T-01', title: 'a' }, { id: 'T-02', title: 'b' }] }], pieces: [] }));
  const w = (a) => node([WRITER, ...a], repo);
  assert.equal(w(['init', '--file', 'docs/implementations/demo/status.json', '--plan', 'plan.json', '--by', 'plan-it']).status, 0);
  for (const t of ['T-01', 'T-02']) {
    writeFileSync(join(dir, `${t}-done.md`), `built ${t}\n`);
    assert.equal(w(['set', t, '--status', 'in-progress', '--by', 'build-it', '--impl', 'demo']).status, 0);
    assert.equal(w(['set', t, '--status', 'done', '--evidence', `docs/implementations/demo/${t}-done.md`, '--by', 'build-it', '--impl', 'demo']).status, 0);
  }
  return { repo, dir, status: join(dir, 'status.json') };
}
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const sync = (repo, report) => node([SYNC, '--report', report, '--impl', 'demo', '--repo', repo, '--writer', WRITER], repo);

test('mixed run exits 0 and records both outcomes', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\n\ntask: T-01\nverdict: PASS\n\ntask: T-02\nverdict: FAIL\nnote: case T-E1-02 failed: empty export\n`);
  const r = sync(repo, 'docs/implementations/demo/review/report.md');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s = read(status);
  const tasks = Object.fromEntries(s.waves.flatMap((w) => w.tasks).map((t) => [t.id, t]));
  assert.equal(tasks['T-01'].status, 'verified');
  assert.equal(tasks['T-02'].status, 'in-progress');
  const h1 = s.history.filter((h) => h.task === 'T-01').at(-1);
  assert.deepEqual([h1.from, h1.to, h1.by], ['done', 'verified', 'review-it']);
  const h2 = s.history.filter((h) => h.task === 'T-02').at(-1);
  assert.deepEqual([h2.from, h2.to, h2.by], ['done', 'in-progress', 'review-it']);
  assert.match(h2.note, /empty export/);
  assert.equal(node([WRITER, 'validate', '--file', status], repo).status, 0);
});

test('a report without a task: line is refused, status.json untouched', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: PASS\n`);
  const before = readFileSync(status, 'utf8');
  const r = sync(repo, 'docs/implementations/demo/review/report.md');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no "task: <ID>"/);
  assert.equal(readFileSync(status, 'utf8'), before);
  // and the writer itself refuses such a file as verified evidence
  const w = node([WRITER, 'set', 'T-01', '--status', 'verified', '--evidence', 'docs/implementations/demo/review/report.md', '--by', 'review-it', '--impl', 'demo'], repo);
  assert.equal(w.status, 1);
  assert.match(w.stderr, /does not name task T-01/);
  assert.equal(readFileSync(status, 'utf8'), before);
});
