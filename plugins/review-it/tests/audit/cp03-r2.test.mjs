// node --test 'tests/audit/cp03-r2.test.mjs'   (from plugins/review-it)
// Regression cases for CP-03 round 2 (docs/implementation/do-it-1.1/plan/reviews/CP-03-adversarial.md,
// "Round 2", §2 and §4). Each case replays the reviewer's command and asserts a refusal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, exists, read, cleanup, REPOS, REPO } from './helpers.mjs';
import { resolveFamily, producesEvidence, verifyEvidence } from '../../scripts/audit-chain.mjs';

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


// A legit chain: C1 TRUE, C2 FALSE → PUBLISHABLE with SAFE (1): C1, DO-NOT-PUBLISH (1): C2.
function publishedChain() {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(['start', ledger, '--auditor-model', 'sonnet', ...REPOS], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'FALSE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  const o = run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(o.status, 0, o.stderr);
  assert.equal(state(ws).state, 'PUBLISHABLE');
  return { ws, ledger };
}

test('R2-Q1-M5 a hand edit of the published SAFE.md is detected: status exits 1 with PUBLISHED_TAMPERED', () => {
  const { ws, ledger } = publishedChain();
  const st = state(ws);
  assert.equal(Object.keys(st.published.sha256).length, 3, 'one hash per published file');
  const clean = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /published .*: SAFE 1, DO-NOT-PUBLISH 1; files match their hashes/);
  // The reviewer's edit: move C2 into SAFE, DO-NOT-PUBLISH → none.
  const safe = read(ws, 'audit/SAFE.md');
  const forged = safe.replace(/## SAFE \(1\)\n\n- C1 — thing one\n/, '## SAFE (2)\n\n- C1 — thing one\n- C2 — thing two\n')
    .replace(/## DO-NOT-PUBLISH \(1\)\n\n- C2 \(FALSE\)[^\n]*\n/, '## DO-NOT-PUBLISH (0)\n\n- none\n');
  assert.notEqual(forged, safe, 'the forgery applied');
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), forged);
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /PUBLISHED_TAMPERED: audit\/SAFE.md does not match the sha256 recorded at publish/);
  assert.doesNotMatch(s.stdout, /files match their hashes/);
  const j = run(['status', '--json', '--ledger', ledger], { home: ws.home });
  assert.equal(j.status, 1);
  assert.deepEqual(JSON.parse(j.stdout).published_tampered.map((x) => x.file), ['SAFE.md']);
  // The other two published files and a deleted file are caught the same way.
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), safe);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0, 'restored → clean');
  for (const f of ['ombudsman.md', 'audit-sonnet.md']) {
    const orig = read(ws, `audit/${f}`);
    writeFileSync(join(ws.dir, `audit/${f}`), orig.replace('UPHELD', 'FALSE').replace('FALSE |', 'TRUE |') + ' ');
    const r = run(['status', '--ledger', ledger], { home: ws.home });
    assert.equal(r.status, 1, f);
    assert.match(r.stderr, new RegExp(`PUBLISHED_TAMPERED: audit/${f.replace('.', '\\.')} does not match`), f);
    writeFileSync(join(ws.dir, `audit/${f}`), orig);
  }
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), '');
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 1);
});

test('R2-Q1-M5 (b) the published hashes are covered by the chain digest: rewriting them in the state is STATE_TAMPERED', () => {
  const { ws, ledger } = publishedChain();
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), read(ws, 'audit/SAFE.md').replace('- C1 — thing one', '- C1 — thing one\n- C2 — thing two'));
  const sf = join(ws.dir, 'audit/chain-state.json');
  const st = JSON.parse(readFileSync(sf, 'utf8'));
  st.published.sha256['SAFE.md'] = 'f'.repeat(64);
  writeFileSync(sf, JSON.stringify(st, null, 2) + '\n');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /STATE_TAMPERED/);
});


test('R2-Q1-M5 (c) the files a restart or abort keeps stay bound to their hashes', () => {
  const { ws, ledger } = publishedChain();
  assert.equal(run(['start', ledger, '--auditor-model', 'sonnet', '--restart', ...REPOS], { home: ws.home }).status, 0);
  assert.equal(run(['abort', '--ledger', ledger], { home: ws.home }).status, 0);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0, 'kept files unchanged → clean');
  writeFileSync(join(ws.dir, 'audit/SAFE.md'), read(ws, 'audit/SAFE.md').replace('- C1 — thing one', '- C1 — thing one\n- C2 — thing two'));
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /PUBLISHED_TAMPERED: audit\/SAFE.md/);
});

test('R2-L5 `ls` and `cat` with no path argument, or reading /dev/*, are not evidence', () => {
  for (const c of ['ls', 'cat /dev/null', 'ls -la', 'cat', 'cd x && ls', 'cat < /dev/null'])
    assert.equal(producesEvidence(c), false, c);
  for (const c of ['ls docs/', 'cat LICENSE', 'git show eed4dec:LICENSE | cat', 'cat -n README.md'])
    assert.equal(producesEvidence(c), true, c);
  assert.equal(verifyEvidence('`ls`', {}).ok, false);
});

test('R2-L6 a --repos path must be a repo top level whose folder or remote matches the repo name', () => {
  // `x=` resolves to the ledger folder; git -C would walk up to an enclosing repo. Refused as unchecked.
  const sub = join(REPO, 'plugins');
  const v = verifyEvidence('review-it@eed4dec:LICENSE', { 'review-it': sub });
  assert.equal(v.ok, false);
  assert.match(v.reason, /unchecked: .*not the top level of a git repo/);
  // A real repo under another name: neither its folder nor its remote is "do-it".
  const w = verifyEvidence('do-it@eed4dec:LICENSE', { 'do-it': REPO });
  assert.equal(w.ok, false);
  assert.match(w.reason, /unchecked: .*neither its folder nor its origin remote is named "do-it"/);
  // The suite's own repo resolves (its origin remote is review-it).
  assert.equal(verifyEvidence('review-it@eed4dec:LICENSE', { 'review-it': REPO }).ok, true);
});

