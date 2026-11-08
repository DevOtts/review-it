// node --test 'tests/audit/cp03.test.mjs'   (from plugins/review-it)
// Regression cases for the CP-03 adversarial review (docs/implementation/do-it-1.1/plan/reviews/
// CP-03-adversarial.md §3). Each case replays the reviewer's attack and asserts a refusal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, exists, read, cleanup } from './helpers.mjs';
import { resolveFamily } from '../../scripts/audit-chain.mjs';

after(cleanup);

// The reviewer's ledger: Author model opus, rows C1/C2 tier code.
function opusLedger(ws) {
  const f = join(ws.dir, 'opus-claims.md');
  writeFileSync(f, ['# ledger', '', 'Author model: opus', '',
    '| ID | Claim | Tier | Source |', '|---|---|---|---|',
    '| C1 | thing one | code | review-it@eed4dec:LICENSE:1 |',
    '| C2 | thing two | code | review-it@eed4dec:LICENSE:1 |', ''].join('\n'));
  return f;
}

test('Q1-H1 an alias the family list does not know cannot beat G-6: opusplan, claudeopus, best are refused before dispatch', () => {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  for (const m of ['opusplan', 'claudeopus', 'best', 'default', 'claude-opus-5-5', 'Opus', 'OPUS5.5', 'us.anthropic.claude-opus-5-5-v1:0', 'claude-opus-5-5[1m]']) {
    const r = run(['start', ledger, '--auditor-model', m], { home: ws.home });
    assert.equal(r.status, 1, `${m}: ${r.stderr}`);
    assert.match(r.stderr, /G-6/, m);
    assert.equal(r.dispatches.length, 0, m);
    assert.ok(!exists(ws, 'audit'), `${m}: nothing written`);
  }
  // A truly unknown id is refused and named, with the way out.
  const u = run(['start', ledger, '--auditor-model', 'zephyr-7'], { home: ws.home });
  assert.equal(u.status, 1);
  assert.match(u.stderr, /unknown model family: zephyr-7; declare it with --model-family <family>/);
  // The declared family must differ from the author's.
  const same = run(['start', ledger, '--auditor-model', 'zephyr-7', '--model-family', 'opus'], { home: ws.home });
  assert.equal(same.status, 1);
  assert.match(same.stderr, /G-6: auditor model zephyr-7 is the author's model/);
  // A declaration cannot relabel a known alias, and a pointer cannot be declared at all.
  assert.match(run(['start', ledger, '--auditor-model', 'opusplan', '--model-family', 'opusplan=sonnet'], { home: ws.home }).stderr, /contradicts the known family/);
  assert.match(run(['start', ledger, '--auditor-model', 'best', '--model-family', 'best=sonnet'], { home: ws.home }).stderr, /host pointer/);
  assert.ok(!exists(ws, 'audit'));
  // An unknown AUTHOR fails closed too.
  writeFileSync(join(ws.dir, 'odd.md'), read(ws, 'opus-claims.md').replace('Author model: opus', 'Author model: mystery-1'));
  const a = run(['start', join(ws.dir, 'odd.md'), '--auditor-model', 'sonnet'], { home: ws.home });
  assert.equal(a.status, 1);
  assert.match(a.stderr, /unknown model family: mystery-1/);
  // A declared, different family proceeds and is remembered for record-audit.
  const ok = run(['start', ledger, '--auditor-model', 'zephyr-7', '--model-family', 'gemini'], { home: ws.home });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(state(ws).families.auditor, 'gemini');
});

test('Q1-H1 (b) the family table normalises case, claude- prefixes, versions, dates and tiers', () => {
  const cases = {
    'claude-opus-5-5': 'opus', 'Opus 5.5': 'opus', 'OPUS5.5': 'opus', opusplan: 'opus', claudeopus: 'opus', 'claude-opus-4-8': 'opus',
    'us.anthropic.claude-opus-5-5-v1:0': 'opus', 'claude-opus-5-5[1m]': 'opus', 'sonnet[1m]': 'sonnet', 'claude-3-5-sonnet-20241022': 'sonnet',
    'claude-haiku-5-5': 'haiku', 'gpt-5-codex': 'gpt', 'gemini-2.5-pro': 'gemini', 'claude-sonnet-5-5-latest': 'sonnet',
  };
  for (const [id, fam] of Object.entries(cases)) assert.equal(resolveFamily(id).family, fam, id);
  for (const id of ['best', 'default', 'inherit', 'zephyr-7', 'opus-sonnet-mix', '']) assert.ok(resolveFamily(id).error, id);
});

test('Q1-H1 (c) a verdict file from an unknown model is refused at record-audit, not compared as a string', () => {
  const ws = workspace('chain');
  assert.equal(run(['start', ws.ledger, '--auditor-model', 'claude-haiku-5-5'], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'a.md'), read(ws, 'audit-full.md').replace('model: claude-haiku-5-5', 'model: sonnetplan'));
  const r = run(['record-audit', join(ws.dir, 'a.md'), '--ledger', ws.ledger], { home: ws.home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown model family: sonnetplan/);
  assert.equal(state(ws).state, 'AUDITING');
});
