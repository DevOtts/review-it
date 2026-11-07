// node --test 'tests/audit/chain.test.mjs'   (from plugins/review-it)
// Q1 Test Contract, auto cases: T-Q1-02, T-Q1-03, T-Q1-05, T-Q1-06, plus T-Q1-04-path (the scripted
// state path of the judgement case T-Q1-04). The host's dispatches are simulated with fixture files.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, exists, read, states, tmp, cleanup } from './helpers.mjs';

after(cleanup);
const L = (ws) => ['--ledger', ws.ledger];
const AUD = ['--auditor-model', 'claude-haiku-5-5'];

test('T-Q1-02 auditor file missing 3 rows → AUDIT_RETRY_FAILED, one re-dispatch with those rows; second miss → ESCALATED_TO_OWNER, nothing published', () => {
  const ws = workspace('chain');
  const s = run(['start', ws.ledger, ...AUD], { home: ws.home });
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.dispatches.length, 1);
  assert.deepEqual(s.dispatches[0].rows, ['C1', 'C2', 'C3', 'C4', 'C5']);
  assert.equal(s.dispatches[0].role, 'auditor');

  const a1 = run(['record-audit', join(ws.dir, 'audit-missing-3.md'), ...L(ws)], { home: ws.home });
  assert.equal(a1.status, 0, a1.stderr);
  assert.match(a1.stderr, /AUDIT_RETRY_FAILED: 3 row\(s\) missing/);
  assert.equal(a1.dispatches.length, 1, 'exactly one re-dispatch');
  assert.deepEqual(a1.dispatches[0].rows, ['C2', 'C3', 'C5'], 're-dispatch names only the missing rows');
  let st = state(ws);
  assert.equal(st.state, 'AUDITING');
  assert.deepEqual(states(st).slice(-2), ['AUDIT_RETRY_FAILED', 'AUDITING']);

  const a2 = run(['record-audit', join(ws.dir, 'audit-retry-still-missing.md'), ...L(ws)], { home: ws.home });
  assert.equal(a2.status, 3, 'escalation exits 3');
  assert.equal(a2.dispatches.length, 0, 'no third dispatch');
  assert.match(a2.stderr, /ESCALATED_TO_OWNER/);
  assert.match(a2.stderr, /C3 \(no row\)/);
  assert.match(a2.stderr, /C5 \(evidence cites no repo@sha and no command\)/);
  st = state(ws);
  assert.equal(st.state, 'ESCALATED_TO_OWNER');
  assert.deepEqual(states(st).slice(-2), ['AUDIT_RETRY_FAILED', 'ESCALATED_TO_OWNER']);
  assert.equal(st.published, false);
  for (const f of ['audit/SAFE.md', 'audit/ombudsman.md', 'audit/audit-claude-haiku-5-5.md']) assert.ok(!exists(ws, f), `${f} not published`);
  // An escalated chain is the owner's: recording more verdicts is refused.
  assert.equal(run(['record-audit', join(ws.dir, 'audit-full.md'), ...L(ws)], { home: ws.home }).status, 1);
});

test('T-Q1-02 (b) a missing verdict file counts as a miss; the retry that covers the rows proceeds to ADJUDICATING', () => {
  const ws = workspace('chain');
  run(['start', ws.ledger, ...AUD], { home: ws.home });
  const a1 = run(['record-audit', join(ws.dir, 'no-such-file.md'), ...L(ws)], { home: ws.home });
  assert.equal(a1.status, 0);
  assert.deepEqual(a1.dispatches[0].rows, ['C1', 'C2', 'C3', 'C4', 'C5']);
  writeFileSync(join(ws.dir, 'a.md'), read(ws, 'audit-full.md'));
  const a2 = run(['record-audit', join(ws.dir, 'a.md'), ...L(ws)], { home: ws.home });
  assert.equal(a2.status, 0, a2.stderr);
  assert.equal(a2.dispatches[0].role, 'ombudsman');
  assert.deepEqual(states(state(ws)).slice(-2), ['AUDITED', 'ADJUDICATING']);
});

test('T-Q1-03 author model = auditor model → refused before dispatch (G-6)', () => {
  const ws = workspace('chain');
  const same = run(['start', join(ws.dir, 'claims-same-author.md'), '--auditor-model', 'claude-opus-5-5'], { home: ws.home });
  assert.equal(same.status, 1);
  assert.match(same.stderr, /G-6/);
  assert.equal(same.dispatches.length, 0, 'no dispatch emitted');
  assert.ok(!exists(ws, 'audit'), 'nothing written');

  // A bare family alias and a sibling version of the author's family are the same model.
  for (const m of ['opus', 'claude-opus-4-8', 'Opus 5.5']) {
    const r = run(['start', join(ws.dir, 'claims-same-author.md'), '--auditor-model', m], { home: ws.home });
    assert.equal(r.status, 1, m);
    assert.equal(r.dispatches.length, 0, m);
  }
  // The flag form of the author model is checked the same way.
  const flag = run(['start', ws.ledger, '--author-model', 'claude-sonnet-5-5', '--auditor-model', 'sonnet'], { home: ws.home });
  assert.equal(flag.status, 1);
  assert.match(flag.stderr, /G-6/);
  // No author model at all → refused: G-6 cannot be checked.
  writeFileSync(join(ws.dir, 'anon.md'), read(ws, 'claims.md').replace(/^Author model:.*$/m, ''));
  const anon = run(['start', join(ws.dir, 'anon.md'), ...AUD], { home: ws.home });
  assert.equal(anon.status, 1);
  assert.match(anon.stderr, /author model unknown/);
  assert.equal(anon.dispatches.length, 0);
  // A verdict file written by the author's model is not recorded either.
  assert.equal(run(['start', ws.ledger, ...AUD], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'by-author.md'), read(ws, 'audit-full.md').replace('model: claude-haiku-5-5', 'model: claude-sonnet-5-5'));
  const rec = run(['record-audit', join(ws.dir, 'by-author.md'), ...L(ws)], { home: ws.home });
  assert.equal(rec.status, 1);
  assert.match(rec.stderr, /G-6/);
  assert.equal(state(ws).state, 'AUDITING');
});

test('T-Q1-05 --stakes routine → no subagent dispatched; only gate-check claims runs', () => {
  const ws = workspace('chain');
  const logf = join(tmp(), 'gate-check-calls.log');
  const fake = join(tmp(), 'gate-check.mjs');
  writeFileSync(fake, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(logf)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nconsole.log('claims: 5 rows ok');\n`);
  const r = run(['start', ws.ledger, '--stakes', 'routine'], { home: ws.home, env: { PLAN_IT_GATE_CHECK: fake } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.dispatches.length, 0, 'no DISPATCH line');
  assert.doesNotMatch(r.stdout, /DISPATCH/);
  const calls = readFileSync(logf, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls, [['claims', ws.ledger]], 'gate-check ran exactly once, as `claims <ledger>`');
  assert.match(r.stdout, /claims: 5 rows ok/);
  assert.match(r.stdout, /routine: gate-check claims exit 0 — PASS; no auditor or ombudsman dispatched/);
  assert.ok(!exists(ws, 'audit'), 'no chain state, no audit files');

  // A failing lint fails the routine run, still without dispatch.
  writeFileSync(fake, `console.log('C2: sha/path rule'); process.exit(1);\n`);
  const bad = run(['start', ws.ledger, '--stakes', 'routine'], { home: ws.home, env: { PLAN_IT_GATE_CHECK: fake } });
  assert.equal(bad.status, 1);
  assert.equal(bad.dispatches.length, 0);
  assert.match(bad.stdout, /FAIL/);

  // plan-it absent → the skip line, never PASS, no dispatch.
  const none = run(['start', ws.ledger, '--stakes', 'routine'], { home: ws.home });
  assert.equal(none.status, 0);
  assert.match(none.stderr, /^\[skip\] plan-it not installed: gate-check claims$/m);
  assert.doesNotMatch(none.stdout, /PASS/);
  assert.equal(none.dispatches.length, 0);
});

test('T-Q1-05 (b) routine finds plan-it gate-check in the install cache under HOME', () => {
  const ws = workspace('chain');
  const dir = join(ws.home, '.claude/plugins/cache/mkt/plan-it/9.0.0/scripts');
  mkdirSync(dir, { recursive: true });
  const logf = join(tmp(), 'calls.log');
  writeFileSync(join(dir, 'gate-check.mjs'), `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(logf)}, process.argv.slice(2).join(' ') + '\\n');\n`);
  const r = run(['start', ws.ledger, '--stakes', 'routine'], { home: ws.home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(logf, 'utf8').trim(), `claims ${ws.ledger}`);
  assert.equal(r.dispatches.length, 0);
});

test('T-Q1-06 owner aborts during ADJUDICATING → ABORTED; rollback keeps the last published version; no SAFE.md written', () => {
  const ws = workspace('chain');
  // First chain publishes: this is "the last published version".
  run(['start', ws.ledger, ...AUD], { home: ws.home });
  assert.equal(run(['record-audit', join(ws.dir, 'audit-full.md'), ...L(ws)], { home: ws.home }).status, 0);
  const pub = run(['record-ombudsman', join(ws.dir, 'ombudsman-upheld.md'), ...L(ws)], { home: ws.home });
  assert.equal(pub.status, 0, pub.stderr);
  assert.equal(state(ws).state, 'PUBLISHABLE');
  const before = { safe: read(ws, 'audit/SAFE.md'), omb: read(ws, 'audit/ombudsman.md'), aud: read(ws, 'audit/audit-claude-haiku-5-5.md') };

  // Second chain, aborted while the ombudsman is ruling.
  assert.equal(run(['start', ws.ledger, ...AUD], { home: ws.home }).status, 0);
  assert.equal(run(['record-audit', join(ws.dir, 'audit-full.md'), ...L(ws)], { home: ws.home }).status, 0);
  assert.equal(state(ws).state, 'ADJUDICATING');
  const ab = run(['abort', '--reason', 'owner stop', ...L(ws)], { home: ws.home });
  assert.equal(ab.status, 0, ab.stderr);
  assert.match(ab.stderr, /ABORTED from ADJUDICATING/);
  const st = state(ws);
  assert.deepEqual(states(st).slice(-2), ['ABORTED', 'LEDGER_READY']);
  assert.equal(st.aborted.from, 'ADJUDICATING');
  assert.equal(st.pending, null);
  assert.equal(read(ws, 'audit/SAFE.md'), before.safe, 'SAFE.md unchanged');
  assert.equal(read(ws, 'audit/ombudsman.md'), before.omb);
  assert.equal(read(ws, 'audit/audit-claude-haiku-5-5.md'), before.aud);
  assert.ok(!exists(ws, 'audit/.work'), 'work files rolled back');
  // Rulings arriving after the abort are not recorded, nothing is republished.
  assert.equal(run(['record-ombudsman', join(ws.dir, 'ombudsman-upheld.md'), ...L(ws)], { home: ws.home }).status, 1);
  assert.equal(read(ws, 'audit/SAFE.md'), before.safe);
});

test('T-Q1-06 (b) abort with no earlier publish leaves no SAFE.md; abort during AUDITING too', () => {
  const ws = workspace('chain');
  run(['start', ws.ledger, ...AUD], { home: ws.home });
  run(['record-audit', join(ws.dir, 'audit-full.md'), ...L(ws)], { home: ws.home });
  assert.equal(run(['abort', ...L(ws)], { home: ws.home }).status, 0);
  assert.ok(!exists(ws, 'audit/SAFE.md'));
  assert.equal(run(['status', ...L(ws)], { home: ws.home }).stdout.split('\n')[0], 'state LEDGER_READY (rolled back after ABORTED from ADJUDICATING)');
  run(['start', ws.ledger, ...AUD], { home: ws.home });
  assert.equal(run(['abort', ...L(ws)], { home: ws.home }).status, 0);
  assert.equal(state(ws).aborted.from, 'AUDITING');
  assert.ok(!exists(ws, 'audit/SAFE.md'));
});

test('T-Q1-04-path planted false TRUE: ombudsman overturns → PARTIAL_TRUST → auditor re-checks that class → claim in DO-NOT-PUBLISH', () => {
  const ws = workspace('planted-false-true');
  assert.equal(run(['start', ws.ledger, ...AUD], { home: ws.home }).status, 0);
  const a = run(['record-audit', join(ws.dir, 'audit-planted.md'), ...L(ws)], { home: ws.home });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.dispatches[0].role, 'ombudsman');
  assert.match(a.dispatches[0].model, /opus/);

  const o1 = run(['record-ombudsman', join(ws.dir, 'ombudsman-overturn.md'), ...L(ws)], { home: ws.home });
  assert.equal(o1.status, 0, o1.stderr);
  let st = state(ws);
  assert.equal(st.state, 'PARTIAL_TRUST');
  const pt = st.history.at(-1);
  assert.deepEqual(pt.overturned, ['P3']);
  assert.deepEqual(pt.classes, ['code']);
  assert.equal(o1.dispatches.length, 1);
  assert.equal(o1.dispatches[0].role, 'auditor');
  assert.deepEqual(o1.dispatches[0].rows, ['P1', 'P2'], 're-check = the other TRUE rows of the class');
  assert.ok(!exists(ws, 'audit/SAFE.md'));

  const rc = run(['record-audit', join(ws.dir, 'audit-recheck.md'), ...L(ws)], { home: ws.home });
  assert.equal(rc.status, 0, rc.stderr);
  assert.equal(state(ws).state, 'ADJUDICATING');
  assert.deepEqual(rc.dispatches[0].rows, ['P1', 'P2']);

  const o2 = run(['record-ombudsman', join(ws.dir, 'ombudsman-recheck.md'), ...L(ws)], { home: ws.home });
  assert.equal(o2.status, 0, o2.stderr);
  st = state(ws);
  assert.equal(st.state, 'PUBLISHABLE');
  assert.deepEqual(states(st).filter((s) => ['AUDITING', 'AUDITED', 'ADJUDICATING', 'PARTIAL_TRUST', 'ADJUDICATED', 'PUBLISHABLE'].includes(s)),
    ['AUDITING', 'AUDITED', 'ADJUDICATING', 'PARTIAL_TRUST', 'ADJUDICATING', 'ADJUDICATED', 'PUBLISHABLE']);
  const safe = read(ws, 'audit/SAFE.md');
  const [safePart, dnpPart] = safe.split('## DO-NOT-PUBLISH');
  assert.match(dnpPart, /- P3 \(FALSE\)/);
  assert.doesNotMatch(safePart, /- P3 /);
  for (const id of ['P1', 'P2', 'P4']) assert.match(safePart, new RegExp(`- ${id} `));
  assert.match(safe, /\| auditor \| claude-haiku-5-5 \| 2 \| 1300 \|/);
  assert.match(safe, /\| ombudsman \| opus \| 2 \| 2700 \|/);
  assert.match(read(ws, 'audit/ombudsman.md'), /Re-audited classes \(PARTIAL_TRUST\): code/);
});

test('happy path publishes the three §2.5 files, every row tier-tagged and cited', () => {
  const ws = workspace('chain');
  run(['start', ws.ledger, ...AUD], { home: ws.home });
  run(['record-audit', join(ws.dir, 'audit-full.md'), ...L(ws)], { home: ws.home });
  const p = run(['record-ombudsman', join(ws.dir, 'ombudsman-upheld.md'), ...L(ws)], { home: ws.home });
  assert.equal(p.status, 0, p.stderr);
  const aud = read(ws, 'audit/audit-claude-haiku-5-5.md');
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5']) assert.match(aud, new RegExp(`^\\| ${id} \\| \\S`, 'm'));
  const safe = read(ws, 'audit/SAFE.md');
  assert.match(safe, /## SAFE \(4\)/);
  assert.match(safe, /## DO-NOT-PUBLISH \(1\)\n\n- C5 \(PARTIAL\)/);
  assert.match(safe, /## Tokens per role/);
  // Ombudsman of the wrong model is refused (D6).
  const ws2 = workspace('chain');
  run(['start', ws2.ledger, ...AUD], { home: ws2.home });
  run(['record-audit', join(ws2.dir, 'audit-full.md'), ...L(ws2)], { home: ws2.home });
  writeFileSync(join(ws2.dir, 'o.md'), read(ws2, 'ombudsman-upheld.md').replace('claude-opus-5-5', 'claude-haiku-5-5'));
  assert.equal(run(['record-ombudsman', join(ws2.dir, 'o.md'), ...L(ws2)], { home: ws2.home }).status, 1);
  assert.equal(state(ws2).state, 'ADJUDICATING');
  assert.ok(existsSync(join(ws2.dir, 'audit', 'chain-state.json')));
});

const REAL_GC = process.env.PLAN_IT_GATE_CHECK && existsSync(process.env.PLAN_IT_GATE_CHECK) ? process.env.PLAN_IT_GATE_CHECK : null;
test('T-Q1-05 (c) routine against the real plan-it gate-check claims', { skip: REAL_GC ? false : 'IMPLEMENTED-NOT-VERIFIED: set PLAN_IT_GATE_CHECK to plan-it gate-check.mjs' }, () => {
  const ws = workspace('chain');
  const env = { PLAN_IT_GATE_CHECK: REAL_GC, ...(process.env.DOC_IT_CLI ? { DOC_IT_CLI: process.env.DOC_IT_CLI } : {}) };
  const r = run(['start', ws.ledger, '--stakes', 'routine'], { home: ws.home, env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.dispatches.length, 0);
  assert.match(r.stdout, /routine: gate-check claims exit 0/);
  assert.ok(!exists(ws, 'audit'));
});

test('T-Q1-01-cite evidenceOk accepts repo@sha, <sha>:<path>:line and a backticked command; refuses a bare path', async () => {
  const { evidenceOk } = await import('../../scripts/audit-chain.mjs');
  assert.equal(evidenceOk('review-it@eed4dec:LICENSE:1'), true);
  assert.equal(evidenceOk('`d38cedb:hosts/claude-code/hooks/stop-gate.mjs:20` callSpine(...)'), true);
  assert.equal(evidenceOk('see d38cedb:core/spine/src/stopgate.mjs:11-20'), true);
  assert.equal(evidenceOk('`git show eed4dec:LICENSE`'), true);
  assert.equal(evidenceOk('`runs/*/state.json` says so'), false);
  assert.equal(evidenceOk('the deadbeef commit'), false);
});
