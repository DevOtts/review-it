// node --test 'tests/audit/cp03-r3.test.mjs'   (from plugins/review-it)
// Regression cases for CP-03 round 3 (docs/implementation/do-it-1.1/plan/reviews/CP-03-adversarial.md,
// "Round 3", R3-Q1-M6 and §4 R3-L4). Each case replays the reviewer's commands and asserts a refusal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, appendFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, exists, read, cleanup, REPOS } from './helpers.mjs';

after(cleanup);

function opusLedger(ws) {
  const f = join(ws.dir, 'opus-claims.md');
  writeFileSync(f, ['# ledger', '', 'Author model: opus', '',
    '| ID | Claim | Tier | Source |', '|---|---|---|---|',
    '| C1 | thing one | code | review-it@eed4dec:LICENSE:1 |',
    '| C2 | thing two | code | review-it@eed4dec:LICENSE:1 |', ''].join('\n'));
  return f;
}
const verdicts = (rows, model = 'sonnet') => ['# a', '', `model: ${model}`, '', '| ID | Verdict | Evidence |', '|---|---|---|', ...rows.map(([id, v, e]) => `| ${id} | ${v} | ${e} |`), ''].join('\n');
const rulings = (rows, model = 'opus') => ['# o', '', `model: ${model}`, '', '| ID | Ruling | Reason |', '|---|---|---|', ...rows.map(([id, r, why = '']) => `| ${id} | ${r} | ${why} |`), ''].join('\n');

// The reviewer's legit chain: PUBLISHABLE with SAFE 1: C1; DO-NOT-PUBLISH 1: C2.
function publishedChain() {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(['start', ledger, '--auditor-model', 'sonnet', ...REPOS], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'FALSE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  assert.equal(state(ws).state, 'PUBLISHABLE');
  return { ws, ledger };
}
// The reviewer's forgery: C2 into SAFE, DO-NOT-PUBLISH → none.
function forgeSafe(ws) {
  const safe = read(ws, 'audit/SAFE.md');
  const forged = safe.replace(/## SAFE \(1\)\n\n- C1 — thing one\n/, '## SAFE (2)\n\n- C1 — thing one\n- C2 — thing two\n')
    .replace(/## DO-NOT-PUBLISH \(1\)\n\n- C2 \(FALSE\)[^\n]*\n/, '## DO-NOT-PUBLISH (0)\n\n- none\n');
  assert.notEqual(forged, safe, 'the forgery applied');
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), forged);
  return forged;
}
const startArgs = (ledger, ...extra) => ['start', ledger, '--auditor-model', 'sonnet', ...extra, ...REPOS];

test('R3-Q1-M6 (a) forged SAFE.md + tampered state: `start --restart` refuses PUBLISHED_UNBOUND; status exits 1', () => {
  const { ws, ledger } = publishedChain();
  const forged = forgeSafe(ws);
  appendFileSync(join(ws.dir, 'audit/chain-state.json'), ' ');               // echo " " >> audit/chain-state.json
  const s0 = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s0.status, 1);
  assert.match(s0.stderr, /PUBLISHED_UNBOUND: audit\/SAFE\.md/);
  assert.match(s0.stderr, /STATE_TAMPERED/);
  const before = read(ws, 'audit/chain-state.json');
  const r = run(startArgs(ledger, '--restart'), { home: ws.home });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /refused: PUBLISHED_UNBOUND: audit\/SAFE\.md, audit\/audit-sonnet\.md, audit\/ombudsman\.md/);
  assert.match(r.stderr, /--quarantine-published/);
  assert.equal(r.dispatches.length, 0, 'nothing dispatched');
  assert.equal(read(ws, 'audit/chain-state.json'), before, 'state untouched');
  assert.equal(read(ws, 'audit/SAFE.md'), forged, 'the file stays where it is for the owner to inspect');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /PUBLISHED_UNBOUND: audit\/SAFE\.md/);
  // --json carries the list too
  const j = run(['status', '--json', '--ledger', ledger], { home: ws.home });
  assert.equal(j.status, 1);
  assert.ok(JSON.parse(j.stdout).published_unbound.includes('SAFE.md'));
});

test('R3-Q1-M6 (b) forged SAFE.md + deleted state: plain `start` refuses; `abort` has nothing to roll back; status exits 1', () => {
  const { ws, ledger } = publishedChain();
  forgeSafe(ws);
  rmSync(join(ws.dir, 'audit/chain-state.json')); rmSync(join(ws.dir, 'audit/chain-state.sha256'));
  const r = run(startArgs(ledger), { home: ws.home });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /refused: PUBLISHED_UNBOUND: audit\/SAFE\.md.*there is no chain state/);
  assert.ok(!exists(ws, 'audit/chain-state.json'), 'no state written');
  const a = run(['abort', '--ledger', ledger], { home: ws.home });
  assert.notEqual(a.status, 0, 'abort cannot roll back to a forged "last published version"');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1, 'was exit 2 ("no audit chain state") or exit 0 after start+abort');
  assert.match(s.stderr, /PUBLISHED_UNBOUND: audit\/SAFE\.md, audit\/audit-sonnet\.md, audit\/ombudsman\.md/);
  const j = run(['status', '--json', '--ledger', ledger], { home: ws.home });
  assert.equal(j.status, 1);
  assert.deepEqual(JSON.parse(j.stdout).published_unbound, ['SAFE.md', 'audit-sonnet.md', 'ombudsman.md']);
});

test('R3-Q1-M6 (c) --quarantine-published moves only the unbound files to audit/.quarantine/<timestamp>/ and starts', () => {
  const { ws, ledger } = publishedChain();
  const forged = forgeSafe(ws);                                               // valid state: SAFE.md's bytes ≠ its hash
  const r0 = run(startArgs(ledger, '--restart'), { home: ws.home });
  assert.equal(r0.status, 1, 'a tampered file under a valid state is unbound too');
  assert.match(r0.stderr, /PUBLISHED_UNBOUND: audit\/SAFE\.md is not covered/);
  const r = run(startArgs(ledger, '--restart', '--quarantine-published'), { home: ws.home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.dispatches.length, 1);
  assert.ok(!exists(ws, 'audit/SAFE.md'), 'forged SAFE.md moved out');
  const q = readdirSync(join(ws.dir, 'audit/.quarantine'));
  assert.equal(q.length, 1);
  assert.equal(readFileSync(join(ws.dir, 'audit/.quarantine', q[0], 'SAFE.md'), 'utf8'), forged);
  assert.ok(exists(ws, 'audit/ombudsman.md') && exists(ws, 'audit/audit-sonnet.md'), 'bound files are kept');
  const st = state(ws);
  assert.deepEqual(Object.keys(st.kept_published.sha256).sort(), ['audit-sonnet.md', 'ombudsman.md']);
  assert.deepEqual(st.history.at(-2).quarantined.files, ['SAFE.md']);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0, 'only bound files remain');
  // a SAFE.md planted during the new chain is unbound as well
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), forged);
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /PUBLISHED_UNBOUND: audit\/SAFE\.md/);
  // and the deleted-state path: quarantine everything, then a clean start
  const { ws: ws2, ledger: l2 } = publishedChain();
  forgeSafe(ws2);
  rmSync(join(ws2.dir, 'audit/chain-state.json'));
  const r2 = run(startArgs(l2, '--quarantine-published'), { home: ws2.home });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(state(ws2).kept_published, null);
  assert.equal(run(['status', '--ledger', l2], { home: ws2.home }).status, 0);
  assert.ok(!existsSync(join(ws2.dir, 'audit/SAFE.md')));
});

test('R3-Q1-M6 (d) a legit restart, abort and re-publish stay clean (no false PUBLISHED_UNBOUND)', () => {
  const { ws, ledger } = publishedChain();
  assert.equal(run(startArgs(ledger, '--restart'), { home: ws.home }).status, 0);
  assert.equal(run(['abort', '--ledger', ledger], { home: ws.home }).status, 0);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0);
  // a new chain with a different auditor publishes audit-haiku.md; the old audit-sonnet.md stays bound
  const r = run(['start', ledger, '--auditor-model', 'haiku', ...REPOS], { home: ws.home });
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(ws.dir, 'v2.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'FALSE', '`git show eed4dec:LICENSE`']], 'haiku'));
  assert.equal(run(['record-audit', join(ws.dir, 'v2.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o2.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o2.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /files match their hashes/);
  writeFileSync(join(ws.dir, 'audit/audit-sonnet.md'), 'forged\n');
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 1, 'a carried-over file is still bound');
});

// R3-L4: with a declaration, lookalike ids used to be accepted against an opus author.
const LOOKALIKES = ['o-p-u-s', 'οpus' /* Greek omicron */, 'ｏｐｕｓ' /* fullwidth */, 'claude-0pus-5-5', 'claude-opu5-5-5', 'o pus', 'оpus' /* Cyrillic o */, 'ΟPUS' /* Greek capital omicron */];
test('R3-L4 lookalike model ids fold to the family they imitate: a declaration cannot relabel them, G-6 refuses them', () => {
  for (const id of LOOKALIKES) {
    const ws = workspace('chain');
    const ledger = opusLedger(ws);
    for (const fam of ['sonnet', 'gemini']) {
      const r = run(['start', ledger, '--auditor-model', id, '--model-family', `${id}=${fam}`, ...REPOS], { home: ws.home });
      assert.equal(r.status, 1, `${id} declared ${fam}: ${r.stderr}`);
      assert.match(r.stderr, /refused: G-6: auditor model: --model-family .* contradicts the known family of .* \(opus\); refused/, `${id}=${fam}`);
      assert.ok(!exists(ws, 'audit'), `${id}: nothing written`);
    }
    const plain = run(['start', ledger, '--auditor-model', id, ...REPOS], { home: ws.home });
    assert.equal(plain.status, 1, id);
    assert.match(plain.stderr, /refused: G-6: /, id);
    const asOpus = run(['start', ledger, '--auditor-model', id, '--model-family', `${id}=opus`, ...REPOS], { home: ws.home });
    assert.equal(asOpus.status, 1, id);
    assert.match(asOpus.stderr, /G-6: auditor model .* is the author's model/, id);
    assert.ok(!exists(ws, 'audit'), `${id}: nothing written`);
  }
});

test('R3-L4 (b) an id that still holds non-ASCII after NFKC and the lookalike fold is refused, even when declared', () => {
  for (const id of ['opüs', 'օpus' /* Armenian */, 'opus‍', 'son­net', 'gemıní']) {
    const ws = workspace('chain');
    const ledger = opusLedger(ws);
    const r = run(['start', ledger, '--auditor-model', id, '--model-family', `${id}=sonnet`, ...REPOS], { home: ws.home });
    assert.equal(r.status, 1, JSON.stringify(id));
    assert.match(r.stderr, /contains non-ASCII or control characters \(U\+[0-9A-F]{4}/, JSON.stringify(id));
    assert.ok(!exists(ws, 'audit'));
  }
  // the author side resolves through the same rule
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  const r = run(['start', ledger, '--author-model', 'οpus', '--auditor-model', 'claude-sonnet-5-5', ...REPOS], { home: ws.home });
  assert.equal(r.status, 0, 'Greek-omicron author folds to opus, matching the ledger header: ' + r.stderr);
  const r2 = run(['start', ledger, '--restart', '--author-model', 'οpus', '--auditor-model', 'ｏｐｕｓ', ...REPOS], { home: ws.home });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /G-6: auditor model ｏｐｕｓ is the author's model/);
});
