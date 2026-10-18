// node --test plugins/review-it/tests/status-sync.test.mjs
// Fixture implementation: T-01 reviewed PASS, T-02 reviewed FAIL. Asserts the status.json afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, copyFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const sync = (repo, report, script = SYNC) => node([script, '--report', report, '--impl', 'demo', '--repo', repo, '--writer', WRITER], repo);

// Overall PASS with a FAIL task is incoherent (2b), so the two outcomes come from two reports:
// a FAIL run that sends T-02 back, then a run scoped to T-01 that passes.
test('mixed run exits 0 and records both outcomes', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/fail.md'), `# review-it report\nverdict: FAIL\n\ntask: T-02\nverdict: FAIL\nnote: case T-E1-02 failed: empty export\n`);
  let r = sync(repo, 'docs/implementations/demo/review/fail.md');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: PASS\n\ntask: T-01\nverdict: PASS\n`);
  r = sync(repo, 'docs/implementations/demo/review/report.md');
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

// Adversarial cases (verifier, PR #5). No path may turn a task verified without a real PASS.
const REPORT = 'docs/implementations/demo/review/report.md';
const tasksOf = (f) => Object.fromEntries(read(f).waves.flatMap((w) => w.tasks).map((t) => [t.id, t]));
const fence = '`'.repeat(3);

test('PASS pair inside a fenced block with overall FAIL: nothing verified', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: FAIL\n\n| T-E1-01 | AUTHORED | FAIL | x |\n\n${fence}\ntask: T-01\nverdict: PASS\n${fence}\n\n~~~\ntask: T-02\nverdict: PASS\n~~~\n\ntask: T-02\nverdict: FAIL\nnote: case T-E1-02 failed\n`);
  const r = sync(repo, REPORT);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const t = tasksOf(status);
  assert.equal(t['T-01'].status, 'done');
  assert.equal(t['T-02'].status, 'in-progress');
  assert.ok(!existsSync(join(dir, 'review/verdict-T-01.md')));
  assert.ok(!existsSync(join(dir, 'review/verdict-T-02.md')));
});

test('a fenced block alone carries no task block: refused, status.json untouched', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: PASS\n\n${fence}md\ntask: T-01\nverdict: PASS\n${fence}\n`);
  const before = readFileSync(status, 'utf8');
  const r = sync(repo, REPORT);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(status, 'utf8'), before);
});

test('overall FAIL with a real per-task PASS: nothing verified', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: FAIL\n\ntask: T-01\nverdict: PASS\n\ntask: T-02\nverdict: FAIL\nnote: case T-E1-02 failed: empty export\n`);
  const r = sync(repo, REPORT);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /overall verdict FAIL/);
  const t = tasksOf(status);
  assert.equal(t['T-01'].status, 'done');
  assert.equal(t['T-02'].status, 'in-progress');
  assert.equal(read(status).history.filter((h) => h.to === 'verified').length, 0);
});

test('missing overall verdict: nothing verified', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\n\ntask: T-01\nverdict: PASS\n\ntask: T-02\nverdict: PASS\n`);
  const r = sync(repo, REPORT);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /overall verdict missing/);
  const t = tasksOf(status);
  assert.equal(t['T-01'].status, 'done');
  assert.equal(t['T-02'].status, 'done');
});

test('overall PASS with one task FAIL is incoherent: refused, nothing written', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\ncheckpoint: CP-01\nverdict: PASS\n\ntask: T-01\nverdict: PASS\n\ntask: T-02\nverdict: FAIL\nnote: case T-E1-02 failed: empty export\n`);
  const before = readFileSync(status, 'utf8');
  const r = sync(repo, REPORT);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /incoherent: overall verdict PASS but task T-02 is FAIL/);
  assert.equal(readFileSync(status, 'utf8'), before);
  assert.ok(!existsSync(join(dir, 'review/verdict-T-01.md')));
  assert.ok(!existsSync(join(dir, 'review/verdict-T-02.md')));
});

test('overall PASS with every task PASS: all verified, verdict files traceable', { skip }, () => {
  const { repo, dir, status } = fixture();
  const body = `# review-it report\ncheckpoint: CP-01\nverdict: PASS\n\ntask: T-01\nverdict: PASS\n\ntask: T-02\nverdict: PASS\n`;
  writeFileSync(join(dir, 'review/report.md'), body);
  const r = sync(repo, REPORT);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const t = tasksOf(status);
  assert.equal(t['T-01'].status, 'verified');
  assert.equal(t['T-02'].status, 'verified');
  const sha = createHash('sha256').update(body).digest('hex');
  for (const id of ['T-01', 'T-02']) {
    const v = readFileSync(join(dir, `review/verdict-${id}.md`), 'utf8');
    assert.match(v, new RegExp(`^report: ${REPORT}$`, 'm'));
    assert.match(v, new RegExp(`^report_sha256: ${sha}$`, 'm'));
  }
  assert.equal(node([WRITER, 'validate', '--file', status], repo).status, 0);
});

for (const [name, body] of [
  ['duplicate task blocks', `verdict: PASS\n\ntask: T-01\nverdict: PASS\n\ntask: T-01\nverdict: FAIL\nnote: x\n`],
  ['two verdicts in one block', `verdict: PASS\n\ntask: T-01\nverdict: PASS\nverdict: FAIL\n`],
  ['two overall verdicts', `verdict: PASS\nverdict: FAIL\n\ntask: T-01\nverdict: PASS\n`],
  ['unknown verdict value', `verdict: PASS\n\ntask: T-01\nverdict: PASS-ish\n`],
  ['stray verdict after the blocks', `verdict: PASS\n\ntask: T-01\nverdict: PASS\n\nverdict: FAIL\n`],
  ['task not on the board', `verdict: PASS\n\ntask: T-01\nverdict: PASS\n\ntask: T-99\nverdict: PASS\n`],
]) {
  test(`ambiguous report (${name}): exit 1, status.json byte-identical, no verdict file`, { skip }, () => {
    const { repo, dir, status } = fixture();
    writeFileSync(join(dir, 'review/report.md'), `# review-it report\n${body}`);
    const before = readFileSync(status, 'utf8');
    const r = sync(repo, REPORT);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /refused/);
    assert.equal(readFileSync(status, 'utf8'), before);
    assert.ok(!existsSync(join(dir, 'review/verdict-T-01.md')));
  });
}

// Invocation paths: main() must actually run (it used to exit 0 silently). A no-task report
// proves it: a running main exits 1 with the refusal.
const PASS_REPORT = `# review-it report\nverdict: PASS\n\ntask: T-01\nverdict: PASS\n`;
function invokedVia(script) {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), PASS_REPORT);
  writeFileSync(join(dir, 'review/none.md'), `# review-it report\nverdict: PASS\n`);
  const none = sync(repo, 'docs/implementations/demo/review/none.md', script);
  assert.equal(none.status, 1, `main did not run via ${script}: ` + none.stdout + none.stderr);
  const r = sync(repo, REPORT, script);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(tasksOf(status)['T-01'].status, 'verified');
}

test('runs through a symlink', { skip }, () => {
  const d = mkdtempSync(join(tmpdir(), 'rev-sync-link-'));
  symlinkSync(SYNC, join(d, 'status-sync.mjs'));
  invokedVia(join(d, 'status-sync.mjs'));
});

test('runs from a path containing a space', { skip }, () => {
  const d = join(mkdtempSync(join(tmpdir(), 'rev-sync-')), 'with space');
  mkdirSync(d);
  copyFileSync(SYNC, join(d, 'status-sync.mjs'));
  invokedVia(join(d, 'status-sync.mjs'));
});

test('runs via /tmp when /tmp is a symlink', { skip: skip || (realpathSync('/tmp') === '/tmp' && '/tmp is not a symlink here') }, () => {
  const d = mkdtempSync('/tmp/rev-sync-tmp-');
  copyFileSync(SYNC, join(d, 'status-sync.mjs'));
  invokedVia(join(d, 'status-sync.mjs'));
});

// The value must be exactly PASS or FAIL. A lenient reader would sync a task as verified from a report that
// build-it's checkpoint reader rejects (lowercase, markdown emphasis, trailing punctuation).
for (const [label, value] of [['lowercase', 'pass'], ['bold', '**PASS**'], ['code', '`PASS`'], ['trailing dot', 'PASS.'], ['mixed case', 'Pass']]) {
  test(`overall verdict written ${label} (${value}) is refused, nothing verified`, { skip }, () => {
    const { repo, dir, status } = fixture();
    writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: ${value}\n\ntask: T-01\nverdict: PASS\n`);
    const before = readFileSync(status, 'utf8');
    const r = sync(repo, 'docs/implementations/demo/review/report.md');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /is not PASS or FAIL/);
    assert.equal(readFileSync(status, 'utf8'), before);
  });
}

test('a task verdict written in lowercase is refused too', { skip }, () => {
  const { repo, dir, status } = fixture();
  writeFileSync(join(dir, 'review/report.md'), `# review-it report\nverdict: PASS\n\ntask: T-01\nverdict: pass\n`);
  const before = readFileSync(status, 'utf8');
  const r = sync(repo, 'docs/implementations/demo/review/report.md');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /is not PASS or FAIL/);
  assert.equal(readFileSync(status, 'utf8'), before);
});
