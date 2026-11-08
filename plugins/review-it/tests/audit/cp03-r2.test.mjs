// node --test 'tests/audit/cp03-r2.test.mjs'   (from plugins/review-it)
// Regression cases for CP-03 round 2 (docs/implementation/do-it-1.1/plan/reviews/CP-03-adversarial.md,
// "Round 2", §2 and §4). Each case replays the reviewer's command and asserts a refusal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, exists, cleanup, REPOS } from './helpers.mjs';
import { resolveFamily } from '../../scripts/audit-chain.mjs';

after(cleanup);

function opusLedger(ws, author = 'opus', name = 'opus-claims.md') {
  const f = join(ws.dir, name);
  writeFileSync(f, ['# ledger', '', `Author model: ${author}`, '',
    '| ID | Claim | Tier | Source |', '|---|---|---|---|',
    '| C1 | thing one | code | review-it@eed4dec:LICENSE:1 |',
    '| C2 | thing two | code | review-it@eed4dec:LICENSE:1 |', ''].join('\n'));
  return f;
}
const verdicts = (rows, model = 'sonnet') => ['# a', '', `model: ${model}`, '', '| ID | Verdict | Evidence |', '|---|---|---|', ...rows.map(([id, v, e]) => `| ${id} | ${v} | ${e} |`), ''].join('\n');
const rulings = (rows, model = 'opus') => ['# o', '', `model: ${model}`, '', '| ID | Ruling | Reason |', '|---|---|---|', ...rows.map(([id, r, why = '']) => `| ${id} | ${r} | ${why} |`), ''].join('\n');

test('R2-Q1-M4 --model-family cannot relabel an id that names the author\'s family (opus-xl, claude-opus-research)', () => {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  // The reviewer's two commands, exactly.
  for (const args of [['--auditor-model', 'opus-xl', '--model-family', 'gemini'], ['--auditor-model', 'claude-opus-research', '--model-family', 'sonnet']]) {
    const r = run(['start', ledger, ...args, ...REPOS], { home: ws.home });
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /contradicts the known family of .* \(opus\)/);
    assert.equal(r.dispatches.length, 0);
    assert.ok(!exists(ws, 'audit'), `${args.join(' ')}: nothing written`);
  }
  // The id=family form, a word that only contains the family, and a declaration of the fixed family.
  assert.match(run(['start', ledger, '--auditor-model', 'opus-xl', '--model-family', 'opus-xl=sonnet'], { home: ws.home }).stderr, /contradicts the known family/);
  assert.match(run(['start', ledger, '--auditor-model', 'opusxl', '--model-family', 'gemini'], { home: ws.home }).stderr, /contradicts the known family/);
  const own = run(['start', ledger, '--auditor-model', 'opus-xl', '--model-family', 'opus'], { home: ws.home });
  assert.equal(own.status, 1);
  assert.match(own.stderr, /G-6: auditor model opus-xl is the author's model/);
  // Without a declaration the id is refused and the only way out names its own family.
  assert.match(run(['start', ledger, '--auditor-model', 'opus-xl'], { home: ws.home }).stderr, /names the opus family .* --model-family opus-xl=opus/);
  // Two families in one id are refused outright, with or without a declaration.
  for (const m of ['sonnet-opus', 'gemini-opus-xl', 'opus-sonnet-mix']) {
    const r = run(['start', ledger, '--auditor-model', m, '--model-family', 'gemini'], { home: ws.home });
    assert.equal(r.status, 1, m);
    assert.match(r.stderr, /names more than one family/, m);
  }
  assert.ok(!exists(ws, 'audit'));
  // Still allowed: a truly unknown id with a different declared family, and gpt-5-codex (codex is a tier there).
  assert.equal(resolveFamily('gpt-5-codex').family, 'gpt');
  assert.equal(resolveFamily('codex-mini').family, 'codex');
  const ok = run(['start', ledger, '--auditor-model', 'zephyr-7', '--model-family', 'gemini', ...REPOS], { home: ws.home });
  assert.equal(ok.status, 0, ok.stderr);
});

test('R2-Q1-M4 (b) the same rules hold for the author model', () => {
  const ws = workspace('chain');
  // An author id that names opus cannot be declared as another family to let an opus auditor through.
  const l1 = opusLedger(ws, 'claude-opus-research');
  const r1 = run(['start', l1, '--auditor-model', 'opus', '--model-family', 'claude-opus-research=sonnet'], { home: ws.home });
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /author model: .*contradicts the known family of claude-opus-research \(opus\)/);
  const plain = opusLedger(ws, 'opus', 'plain.md');
  const r2 = run(['start', plain, '--auditor-model', 'sonnet', '--author-model', 'opus-xl', '--model-family', 'opus-xl=gemini'], { home: ws.home });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /contradicts the known family of opus-xl \(opus\)/);
  const l2 = opusLedger(ws, 'sonnet-opus', 'mixed.md');
  assert.match(run(['start', l2, '--auditor-model', 'gemini'], { home: ws.home }).stderr, /names more than one family/);
  assert.ok(!exists(ws, 'audit'));
  // Declared as its own family, the author resolves and an opus auditor is refused by G-6.
  const r3 = run(['start', l1, '--auditor-model', 'claude-opus-5-5', '--model-family', 'claude-opus-research=opus'], { home: ws.home });
  assert.equal(r3.status, 1);
  assert.match(r3.stderr, /G-6: auditor model claude-opus-5-5 is the author's model/);
});

