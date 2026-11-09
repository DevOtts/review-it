// node --test 'tests/audit/cp03-r4.test.mjs'   (from plugins/review-it)
// Regression cases for CP-03 round 4 (docs/implementation/do-it-1.1/plan/reviews/CP-03-adversarial.md,
// "Round 4", R4-Q1-M7 and §4 R4-L8). Each case replays the reviewer's commands and asserts the fix.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, renameSync, rmSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { workspace, run, state, read, tmp, cleanup, REPOS } from './helpers.mjs';
import { resolveFamily, isPublishedName, caseCollisions, unboundPublished } from '../../scripts/audit-chain.mjs';

after(cleanup);

function opusLedger(ws) {
  const f = join(ws.dir, 'opus-claims.md');
  writeFileSync(f, ['# ledger', '', 'Author model: opus', '',
    '| ID | Claim | Tier | Source |', '|---|---|---|---|',
    '| C1 | thing one | code | review-it@eed4dec:LICENSE:1 |',
    '| C2 | thing two | code | review-it@eed4dec:LICENSE:1 |', ''].join('\n'));
  return f;
}

test('R4-L8 router ids (ollama/…) resolve to the family they serve; declared ones are accepted, not "more than one family"', () => {
  // the reviewer's ids: refused before even when declared ("names more than one family (llama, …)")
  for (const [id, fam] of [['ollama/qwen2.5:7b', 'qwen'], ['ollama/mistral', 'mistral'], ['ollama/deepseek-r1', 'deepseek'],
    ['groq/llama-3.1-70b', 'llama'], ['openrouter/anthropic/claude-sonnet-5-5', 'sonnet'], ['together/qwen-2.5-72b-instruct', 'qwen']]) {
    assert.deepEqual(resolveFamily(id), { family: fam }, id);
    assert.deepEqual(resolveFamily(id, { [id]: fam }), { family: fam }, `${id} declared ${fam}`);
  }
  // ollama/gemma3 was fixed as llama; it names no known family, so it is declarable (and refused undeclared)
  assert.match(resolveFamily('ollama/gemma3').error, /^unknown model family: ollama\/gemma3; declare it/);
  assert.deepEqual(resolveFamily('ollama/gemma3', { 'ollama/gemma3': 'gemini' }), { family: 'gemini' });
  // end to end: the reviewer's start commands against an opus author now start
  for (const [aud, decl] of [['ollama/qwen2.5:7b', null], ['ollama/mistral', 'ollama/mistral=mistral'], ['ollama/deepseek-r1', 'ollama/deepseek-r1=deepseek']]) {
    const ws = workspace('chain');
    const r = run(['start', opusLedger(ws), '--auditor-model', aud, ...(decl ? ['--model-family', decl] : []), ...REPOS], { home: ws.home });
    assert.equal(r.status, 0, `${aud}: ${r.stderr}`);
    assert.equal(state(ws).state, 'AUDITING');
  }
  // a router alone names no model
  for (const id of ['ollama', 'ollama:latest', 'openrouter/']) {
    assert.match(resolveFamily(id, { [id]: 'qwen' }).error, /names only a runtime or router/, id);
  }
});

test('R4-L8 (b) every R2 and R3 refusal stays red, also behind a router prefix', () => {
  const contradicts = /contradicts the known family .*\(opus\)/;
  for (const id of ['opus-xl', 'opusxl', 'claude-opus-research', 'o-p-u-s', 'claude-0pus-5-5', 'claude-opu5-5-5', 'o pus', 'οpus', 'ｏｐｕｓ',
    'ollama/opus-xl', 'ollama/opusxl', 'ollama/0pus', 'ollama/o-p-u-s', 'groq/claude-opus-research', 'openrouter/οpus']) {
    assert.match(resolveFamily(id, { [id]: 'gemini' }).error, contradicts, id);
    assert.match(resolveFamily(id, { [id]: 'sonnet' }).error, contradicts, id);
  }
  // two families in one word are still refused; `ollama` hides nothing when it is not a whole word
  for (const id of ['ollamaopus', 'opus-gpt', 'ollama/opus-gpt', 'ollamasonnet']) {
    assert.match(resolveFamily(id, { [id]: 'opus' }).error, /names more than one family/, id);
  }
  // non-ASCII stays refused behind a prefix
  assert.match(resolveFamily('ollama/opüs', { 'ollama/opüs': 'qwen' }).error, /non-ASCII/);
  // G-6 against an opus author, end to end, nothing written
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  const r = run(['start', ledger, '--auditor-model', 'ollama/opus-xl', '--model-family', 'ollama/opus-xl=gemini', ...REPOS], { home: ws.home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /contradicts the known family of ollama\/opus-xl \(opus\)/);
  const r2 = run(['start', ledger, '--auditor-model', 'ollama/opus-xl', '--model-family', 'ollama/opus-xl=opus', ...REPOS], { home: ws.home });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /G-6: auditor model ollama\/opus-xl is the author's model/);
});

const verdicts = (rows, model = 'sonnet') => ['# a', '', `model: ${model}`, '', '| ID | Verdict | Evidence |', '|---|---|---|', ...rows.map(([id, v, e]) => `| ${id} | ${v} | ${e} |`), ''].join('\n');
const rulings = (rows, model = 'opus') => ['# o', '', `model: ${model}`, '', '| ID | Ruling | Reason |', '|---|---|---|', ...rows.map(([id, r, why = '']) => `| ${id} | ${r} | ${why} |`), ''].join('\n');
const startArgs = (ledger, ...extra) => ['start', ledger, '--auditor-model', 'sonnet', ...extra, ...REPOS];
// A forged SAFE.md in the shape the chain writes, carrying the CURRENT ledger sha256 (the reviewer's file).
const forgedSafe = (ledger) => ['# SAFE — ../opus-claims.md', '', `Chain: author opus → auditor sonnet → ombudsman opus. Ledger sha256 ${createHash('sha256').update(readFileSync(ledger, 'utf8')).digest('hex')}.`,
  '', '## SAFE (2)', '', '- C1 — thing one', '- C2 — thing two', '', '## DO-NOT-PUBLISH (0)', '', '- none', ''].join('\n');
function publishedChain() {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(startArgs(ledger), { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'FALSE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  assert.equal(state(ws).state, 'PUBLISHABLE');
  return { ws, ledger };
}
// Is the temp disk case-sensitive? Only decides whether the on-disk collision replay can run in addition
// to the pure checks below; every assertion before it holds on either kind of disk.
function caseSensitiveTmp() {
  const d = tmp('rev-case-');
  writeFileSync(join(d, 'probe'), 'x');
  return !existsSync(join(d, 'PROBE'));
}

test('R4-Q1-M7 (1) a lower-case audit/safe.md planted in a chain that never published: status exits 1 PUBLISHED_UNBOUND', () => {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(startArgs(ledger), { home: ws.home }).status, 0);
  assert.equal(state(ws).state, 'AUDITING');
  writeFileSync(join(ws.dir, 'audit/safe.md'), forgedSafe(ledger));
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1, `was exit 0: ${s.stdout}`);
  assert.match(s.stderr, /PUBLISHED_UNBOUND: audit\/safe\.md/);
  const j = run(['status', '--json', '--ledger', ledger], { home: ws.home });
  assert.equal(j.status, 1);
  assert.deepEqual(JSON.parse(j.stdout).published_unbound, ['safe.md']);
  // the other spellings a case-insensitive disk opens as a published name, including the long s (ſ → s)
  rmSync(join(ws.dir, 'audit/safe.md'));
  for (const name of ['Safe.md', 'SAFE.MD', 'ſafe.md', 'Ombudsman.md', 'OMBUDSMAN.MD', 'Audit-x.md', 'AUDIT-sonnet.MD']) {
    writeFileSync(join(ws.dir, 'audit', name), 'forged\n');
    const r = run(['status', '--json', '--ledger', ledger], { home: ws.home });
    assert.equal(r.status, 1, name);
    assert.deepEqual(JSON.parse(r.stdout).published_unbound, [name], name);
    rmSync(join(ws.dir, 'audit', name));
  }
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0, 'clean again once the planted files are gone');
});

test('R4-Q1-M7 (2) R3-Q1-M6 (b) with case variants: forged safe.md, Ombudsman.md, Audit-sonnet.md, state deleted → start refuses, status exits 1', () => {
  const { ws, ledger } = publishedChain();
  const a = (f) => join(ws.dir, 'audit', f);
  writeFileSync(a('SAFE.md'), forgedSafe(ledger));
  renameSync(a('SAFE.md'), a('safe.md'));                                     // mv SAFE.md safe.md
  renameSync(a('ombudsman.md'), a('Ombudsman.md'));                           // mv ombudsman.md Ombudsman.md
  renameSync(a('audit-sonnet.md'), a('Audit-sonnet.md'));                     // mv audit-sonnet.md Audit-sonnet.md
  rmSync(a('chain-state.json')); rmSync(a('chain-state.sha256'));             // rm chain-state.json chain-state.sha256
  const r = run(startArgs(ledger), { home: ws.home });
  assert.equal(r.status, 1, `was AUDITING: ${r.stderr}`);
  assert.match(r.stderr, /refused: PUBLISHED_UNBOUND: audit\/Audit-sonnet\.md, audit\/Ombudsman\.md, audit\/safe\.md .*there is no chain state/);
  assert.equal(r.dispatches.length, 0);
  assert.ok(!existsSync(a('chain-state.json')), 'no state written');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1, 'was exit 0');
  assert.match(s.stderr, /PUBLISHED_UNBOUND: audit\/Audit-sonnet\.md, audit\/Ombudsman\.md, audit\/safe\.md/);
  // --quarantine-published moves the three variants out, and the new chain starts clean
  const q = run(startArgs(ledger, '--quarantine-published'), { home: ws.home });
  assert.equal(q.status, 0, q.stderr);
  const qd = readdirSync(a('.quarantine'));
  assert.deepEqual(readdirSync(join(a('.quarantine'), qd[0])).sort(), ['Audit-sonnet.md', 'Ombudsman.md', 'safe.md']);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0);
});

test('R4-Q1-M7 (3) a case variant planted mid-chain is quarantined at publish; the published SAFE.md is the exact name and bound', () => {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(startArgs(ledger), { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'audit/safe.md'), forgedSafe(ledger));
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'FALSE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  const r = run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /quarantined audit\/safe\.md/);
  const names = readdirSync(join(ws.dir, 'audit'));
  assert.ok(names.includes('SAFE.md') && !names.includes('safe.md'), names.join(','));
  assert.match(read(ws, 'audit/SAFE.md'), /## SAFE \(1\)\n\n- C1 — thing one\n/);
  assert.deepEqual(state(ws).published.quarantined.files, ['safe.md']);
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /files match their hashes/);
});

test('R4-Q1-M7 (4) CASE_COLLISION: two names in audit/ that differ only by case are refused (pure, any disk)', () => {
  // name matching folds the way a case-insensitive disk opens a file
  for (const f of ['SAFE.md', 'safe.md', 'Safe.MD', 'ſafe.md', 'ombudsman.md', 'Ombudsman.md', 'audit-sonnet.md', 'Audit-X.MD']) assert.ok(isPublishedName(f), f);
  for (const f of ['SAFE.md.bak', 'xsafe.md', 'chain-state.json', 'audit-.md', '.quarantine', 'audit.md']) assert.ok(!isPublishedName(f), f);
  assert.deepEqual(caseCollisions(['SAFE.md', 'safe.md', 'ombudsman.md', 'chain-state.json']), [['SAFE.md', 'safe.md']]);
  assert.deepEqual(caseCollisions(['SAFE.md', 'ſafe.md', 'Ombudsman.md', 'ombudsman.md']), [['SAFE.md', 'ſafe.md'], ['Ombudsman.md', 'ombudsman.md']]);
  assert.deepEqual(caseCollisions(['SAFE.md', 'ombudsman.md', 'audit-sonnet.md', 'chain-state.json', 'chain-state.sha256', '.chain']), []);
  // the unbound scan binds a file only by its exact recorded name: SAFE.md bound, a variant never, even
  // when (on a case-insensitive disk) the variant reads the very bytes the hash covers
  const d = tmp('rev-case-');
  writeFileSync(join(d, 'SAFE.md'), 'ok\n');
  const h = { 'SAFE.md': createHash('sha256').update('ok\n').digest('hex') };
  assert.deepEqual(unboundPublished(d, h, ['SAFE.md']), []);
  if (!existsSync(join(d, 'safe.md'))) writeFileSync(join(d, 'safe.md'), 'ok\n'); // a case-sensitive disk holds both
  assert.deepEqual(unboundPublished(d, h, ['SAFE.md', 'safe.md']), ['safe.md']);  // the listing a case-sensitive disk gives

  // On a case-sensitive temp disk, replay it end to end as well: status exits 1, start refuses, and
  // --quarantine-published resolves a collision between a bound file and an unbound variant.
  if (caseSensitiveTmp()) {
    const { ws, ledger } = publishedChain();
    writeFileSync(join(ws.dir, 'audit/safe.md'), forgedSafe(ledger));
    const s = run(['status', '--ledger', ledger], { home: ws.home });
    assert.equal(s.status, 1);
    assert.match(s.stderr, /CASE_COLLISION: audit\/SAFE\.md and audit\/safe\.md differ only by case/);
    const r = run(startArgs(ledger, '--restart'), { home: ws.home });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refused: CASE_COLLISION/);
    assert.equal(run(startArgs(ledger, '--restart', '--quarantine-published'), { home: ws.home }).status, 0);
    writeFileSync(join(ws.dir, 'audit/chain-state.JSON'), '{}');
    const r2 = run(startArgs(ledger, '--restart', '--quarantine-published'), { home: ws.home });
    assert.equal(r2.status, 1, 'a collision outside the published names is never resolved by quarantine');
    assert.match(r2.stderr, /CASE_COLLISION: audit\/chain-state\.JSON and audit\/chain-state\.json/);
  }
});
