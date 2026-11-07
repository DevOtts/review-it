// node --test 'tests/doc-it-missing/*.test.mjs'   (from plugins/review-it)
// T-K2-03, review-it part (D14, G-10): on a temp HOME with DOC_IT_CLI unset, `--audit` prints the
// skip line for the tier enum, never reports that check as PASS, and does not fail because of it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { workspace, run, state, read, cleanup } from '../audit/helpers.mjs';

after(cleanup);

test('T-K2-03 review-it --audit without doc-it prints "[skip] doc-it not installed: tier enum" and no PASS for it', () => {
  const ws = workspace('tiers');
  // helpers.run passes only PATH and HOME: DOC_IT_CLI is unset and HOME has no plugin cache.
  const s = run(['start', ws.ledger, '--auditor-model', 'claude-haiku-5-5'], { home: ws.home });
  assert.equal(s.status, 0, 'a missing doc-it does not fail the audit');
  assert.match(s.stderr, /^\[skip\] doc-it not installed: tier enum$/m);
  assert.equal(s.dispatches.length, 1, 'the chain still runs');
  const st = state(ws);
  assert.equal(st.tier_check, 'skipped');
  assert.ok(st.rows.every((r) => r.tier_ids === null), 'no tier is claimed as resolved');

  const status = run(['status', '--ledger', ws.ledger], { home: ws.home }).stdout;
  assert.match(status, /^tier enum: \[skip\] doc-it not installed: tier enum$/m);
  assert.doesNotMatch(status, /tier.*PASS|PASS.*tier/i);

  // Without doc-it an unknown tier cannot be judged: it is not refused, and not passed either.
  const ws2 = workspace('tiers');
  const unk = run(['start', join(ws2.dir, 'claims-unknown-tier.md'), '--auditor-model', 'claude-haiku-5-5'], { home: ws2.home });
  assert.equal(unk.status, 0);
  assert.match(unk.stderr, /^\[skip\] doc-it not installed: tier enum$/m);

  // The published SAFE.md says the tier check was skipped, never that it passed.
  const audit = ['# a', '', 'model: claude-haiku-5-5', '', '| ID | Verdict | Evidence |', '|---|---|---|',
    '| T1 | TRUE | review-it@eed4dec:x |', '| T2 | TRUE | `git log -1` |', '| T3 | TRUE | review-it@eed4dec:docs/usage.md |'].join('\n');
  const omb = ['# o', '', 'model: claude-opus-5-5', '', '| ID | Ruling |', '|---|---|', '| T1 | UPHELD |', '| T2 | UPHELD |', '| T3 | UPHELD |'].join('\n');
  writeFileSync(join(ws.dir, 'a.md'), audit);
  writeFileSync(join(ws.dir, 'o.md'), omb);
  assert.equal(run(['record-audit', join(ws.dir, 'a.md'), '--ledger', ws.ledger], { home: ws.home }).status, 0);
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ws.ledger], { home: ws.home }).status, 0);
  const safe = read(ws, 'audit/SAFE.md');
  assert.match(safe, /\[skip\] doc-it not installed: tier enum \(not checked, not PASS\)/);
  assert.match(read(ws, 'audit/audit-claude-haiku-5-5.md'), /^tier check: \[skip\] doc-it not installed: tier enum$/m);
});
