// node --test 'tests/audit/tiers.test.mjs'   (from plugins/review-it)
// T-K2-02: review-it --audit tags every ledger row with a tier from doc-it's enum and refuses an
// unknown tier. doc-it is found by the X10 rule (DOC_IT_CLI, else the newest install under HOME);
// without it this case cannot be verified and says so instead of passing.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { workspace, run, state, exists, read, cleanup, REPOS } from './helpers.mjs';
import { findDocIt } from '../../scripts/audit-chain.mjs';

after(cleanup);
const DOC = findDocIt();
const skip = DOC ? false : 'IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)';
if (skip) console.log(skip);

test('T-K2-02 3-row ledger: each row carries a tier from doc-it\'s enum; an unknown tier is refused', { skip }, () => {
  const enumOut = spawnSync(process.execPath, [DOC, 'tiers', '--json'], { encoding: 'utf8' });
  assert.equal(enumOut.status, 0, enumOut.stderr);
  const canon = new Set(JSON.parse(enumOut.stdout).tiers);
  assert.ok(canon.size > 0);

  const ws = workspace('tiers');
  const env = { DOC_IT_CLI: DOC };
  const s = run(['start', ws.ledger, '--auditor-model', 'claude-haiku-5-5', ...REPOS], { home: ws.home, env });
  assert.equal(s.status, 0, s.stderr);
  assert.doesNotMatch(s.stderr, /\[skip\] doc-it/);
  const st = state(ws);
  assert.equal(st.tier_check, 'doc-it');
  assert.equal(st.rows.length, 3);
  for (const r of st.rows) {
    assert.ok(Array.isArray(r.tier_ids) && r.tier_ids.length, `${r.id} has resolved tiers`);
    for (const t of r.tier_ids) assert.ok(canon.has(t), `${r.id} tier ${t} is in doc-it's enum`);
  }
  // The aliases resolve through doc-it, not through a copy kept here.
  assert.deepEqual(st.rows.map((r) => r.tier_ids), [['code'], ['code'], ['durable', 'live']]);
  assert.match(run(['status', '--ledger', ws.ledger], { home: ws.home, env }).stdout, /tier enum: checked by doc-it/);

  const ws2 = workspace('tiers');
  const bad = run(['start', join(ws2.dir, 'claims-unknown-tier.md'), '--auditor-model', 'claude-haiku-5-5', ...REPOS], { home: ws2.home, env });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /tier refused/);
  assert.match(bad.stderr, /T2: tier "hearsay" has unknown part "hearsay"/);
  assert.equal(bad.dispatches.length, 0, 'no dispatch for a refused ledger');
  assert.ok(!exists(ws2, 'audit'), 'nothing written for a refused ledger');
});

test('T-K2-02 (b) the published audit file carries each row\'s tier', { skip }, () => {
  const ws = workspace('tiers');
  const env = { DOC_IT_CLI: DOC };
  run(['start', ws.ledger, '--auditor-model', 'claude-haiku-5-5', ...REPOS], { home: ws.home, env });
  const audit = ['# a', '', 'model: claude-haiku-5-5', '', '| ID | Verdict | Evidence |', '|---|---|---|',
    '| T1 | TRUE | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |',
    '| T2 | TRUE | `git log -1 --format=%h eed4dec` |',
    '| T3 | TRUE | review-it@eed4dec:docs/usage.md |'].join('\n');
  const omb = ['# o', '', 'model: claude-opus-5-5', '', '| ID | Ruling | Reason |', '|---|---|---|', '| T1 | UPHELD | |', '| T2 | UPHELD | |', '| T3 | UPHELD | |'].join('\n');
  writeFileSync(join(ws.dir, 'a.md'), audit);
  writeFileSync(join(ws.dir, 'o.md'), omb);
  assert.equal(run(['record-audit', join(ws.dir, 'a.md'), '--ledger', ws.ledger], { home: ws.home, env }).status, 0);
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ws.ledger], { home: ws.home, env }).status, 0);
  assert.ok(exists(ws, 'audit/SAFE.md'));
  const pub = read(ws, 'audit/audit-claude-haiku-5-5.md');
  assert.match(pub, /^\| T3 \| durable-doc \+ local \| TRUE \|/m);
  assert.match(read(ws, 'audit/SAFE.md'), /every row resolved by doc-it/);
});
