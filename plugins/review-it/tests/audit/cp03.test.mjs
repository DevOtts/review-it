// node --test 'tests/audit/cp03.test.mjs'   (from plugins/review-it)
// Regression cases for the CP-03 adversarial review (docs/implementation/do-it-1.1/plan/reviews/
// CP-03-adversarial.md §3). Each case replays the reviewer's attack and asserts a refusal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, exists, read, cleanup, REPOS, REPO } from './helpers.mjs';
import { resolveFamily, verifyEvidence, producesEvidence, chainDigest } from '../../scripts/audit-chain.mjs';

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

const verdicts = (rows, model = 'sonnet') => ['# a', '', `model: ${model}`, '', '| ID | Verdict | Evidence |', '|---|---|---|', ...rows.map(([id, v, e]) => `| ${id} | ${v} | ${e} |`), ''].join('\n');
const rulings = (rows, model = 'opus') => ['# o', '', `model: ${model}`, '', '| ID | Ruling | Reason |', '|---|---|---|', ...rows.map(([id, r]) => `| ${id} | ${r} | |`), ''].join('\n');

test('Q1-M1 a sha that does not exist and an `echo` command are not evidence: the chain never publishes them', () => {
  const ws = workspace('chain');
  const ledger = opusLedger(ws);
  assert.equal(run(['start', ledger, '--auditor-model', 'sonnet', ...REPOS], { home: ws.home }).status, 0);
  const attack = verdicts([['C1', 'TRUE', 'nosuchrepo@deadbeef00'], ['C2', 'TRUE', '`echo TRUE`']]);
  writeFileSync(join(ws.dir, 'v.md'), attack);
  const a1 = run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(a1.status, 0, a1.stderr);
  assert.match(a1.stderr, /C1 \(nosuchrepo@deadbeef00 unchecked: repo "nosuchrepo" not known/);
  assert.match(a1.stderr, /C2 \(evidence cites no repo@sha and no command\)/);
  assert.deepEqual(a1.dispatches[0].rows, ['C1', 'C2'], 'both rows sent back to the auditor');
  const a2 = run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(a2.status, 3, 'second miss escalates');
  assert.equal(state(ws).state, 'ESCALATED_TO_OWNER');
  // The reviewer's ombudsman file (UPHELD both) has nowhere to land.
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home }).status, 1);
  assert.ok(!exists(ws, 'audit/SAFE.md'), 'no SAFE.md');
});

test('Q1-M1 (b) cited shas are looked up with git cat-file in the known repos; unknown repo = unchecked = uncovered', () => {
  const repos = { 'review-it': REPO };
  assert.equal(verifyEvidence('review-it@eed4dec:LICENSE:1', repos).ok, true);
  assert.equal(verifyEvidence('`git show eed4dec:LICENSE | head -1`', repos).ok, true);
  const fake = verifyEvidence('review-it@deadbeef00', repos);
  assert.equal(fake.ok, false); assert.match(fake.reason, /deadbeef00 missing: deadbeef00 does not exist in review-it/);
  const nopath = verifyEvidence('`git show eed4dec:no/such/file.md`', repos);
  assert.equal(nopath.ok, false); assert.match(nopath.reason, /eed4dec:no\/such\/file.md missing/);
  const none = verifyEvidence('review-it@eed4dec:LICENSE', {});
  assert.equal(none.ok, false); assert.match(none.reason, /unchecked/);
  assert.equal(verifyEvidence('`git status --short` -> empty', {}).ok, true, 'a data command with no sha needs no repo');
  // Commands that read no data source are refused, also behind shell glue.
  for (const c of ['echo TRUE', 'printf TRUE', 'true', ':', 'test -f x', 'date', 'cd x && echo TRUE', "bash -c 'echo TRUE'", 'env A=1 echo TRUE'])
    assert.equal(producesEvidence(c), false, c);
  for (const c of ['git log -1', 'cd repo && git log -1', 'echo $(git rev-parse HEAD)', "bash -c 'grep x f'", 'A=b node s.mjs'])
    assert.equal(producesEvidence(c), true, c);
});

test('Q1-M1 (c) the ledger header `Repos:` names the repos, relative to the ledger', () => {
  const ws = workspace('chain');
  const ledger = join(ws.dir, 'r.md');
  writeFileSync(ledger, read(ws, 'claims.md').replace('Author model: claude-sonnet-5-5', `Author model: claude-sonnet-5-5\nRepos: review-it=${REPO}`));
  assert.equal(run(['start', ledger, '--auditor-model', 'claude-haiku-5-5'], { home: ws.home }).status, 0);
  assert.equal(state(ws).repos['review-it'], REPO);
  const a = run(['record-audit', join(ws.dir, 'audit-full.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.dispatches[0].role, 'ombudsman');
});

// Hand-edit chain-state.json; with rehash the forger also recomputes the digest sidecar (the code is public).
function forge(ws, edit, { rehash = false } = {}) {
  const f = join(ws.dir, 'audit', 'chain-state.json');
  const st = JSON.parse(readFileSync(f, 'utf8'));
  edit(st);
  const text = JSON.stringify(st, null, 2) + '\n';
  writeFileSync(f, text);
  if (rehash) writeFileSync(join(ws.dir, 'audit', 'chain-state.sha256'), chainDigest(text, st) + '\n');
}
const twoRowAttack = (ws) => { const ledger = opusLedger(ws); assert.equal(run(['start', ledger, '--auditor-model', 'sonnet', ...REPOS], { home: ws.home }).status, 0); return ledger; };
const forgedAdjudicating = (st) => {
  st.state = 'ADJUDICATING';
  st.audit.verdicts = { C1: { verdict: 'TRUE', evidence: 'forged' }, C2: { verdict: 'TRUE', evidence: 'forged' } };
  st.ombudsman.requested = [];
};

test('Q1-M2 hand-forged chain-state (ADJUDICATING, forged verdicts, nothing requested) is refused with STATE_TAMPERED', () => {
  const ws = workspace('chain');
  const ledger = twoRowAttack(ws);
  forge(ws, forgedAdjudicating);
  writeFileSync(join(ws.dir, 'hdr.md'), '# o\n\nmodel: opus\n');
  const r = run(['record-ombudsman', join(ws.dir, 'hdr.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /STATE_TAMPERED/);
  assert.ok(!exists(ws, 'audit/SAFE.md'));
  // status and abort see it too; `start --restart` is the way out.
  assert.match(run(['status', '--ledger', ledger], { home: ws.home }).stderr, /STATE_TAMPERED/);
  assert.match(run(['abort', '--ledger', ledger], { home: ws.home }).stderr, /STATE_TAMPERED/);
  const rs = run(['start', ledger, '--auditor-model', 'sonnet', '--restart', ...REPOS], { home: ws.home });
  assert.equal(rs.status, 0, rs.stderr);
  assert.equal(state(ws).state, 'AUDITING');
});

test('Q1-M2 (b) a forger who also recomputes the digest still cannot publish: verdicts are re-derived from recorded files', () => {
  const ws = workspace('chain');
  const ledger = twoRowAttack(ws);
  forge(ws, forgedAdjudicating, { rehash: true });
  // The reviewer's header-only rulings file is refused for having no rows.
  writeFileSync(join(ws.dir, 'hdr.md'), '# o\n\nmodel: opus\n');
  const h = run(['record-ombudsman', join(ws.dir, 'hdr.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(h.status, 1);
  assert.match(h.stderr, /no ruling rows/);
  // With rows and a forged request list, publish re-derives and finds no recorded audit.
  forge(ws, (st) => { st.ombudsman.requested = ['C1', 'C2']; }, { rehash: true });
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  const o = run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(o.status, 1, o.stderr);
  assert.match(o.stderr, /STATE_TAMPERED: no recorded auditor file/);
  assert.ok(!exists(ws, 'audit/SAFE.md'), 'no SAFE.md');
  assert.equal(state(ws).state, 'ADJUDICATING', 'state unchanged on refusal');
});

test('Q1-M2 (c) dropping a row from the state, or editing a recorded file, is refused at publish', () => {
  const ws = workspace('chain');
  const ledger = twoRowAttack(ws);
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'TRUE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  // variant: drop C2 from rows + requested, digest recomputed
  forge(ws, (st) => { st.rows = st.rows.filter((r) => r.id !== 'C2'); st.ombudsman.requested = ['C1']; delete st.audit.verdicts.C2; }, { rehash: true });
  const d = run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(d.status, 1);
  assert.match(d.stderr, /STATE_TAMPERED: the state's rows are not the ledger's rows/);
  assert.ok(!exists(ws, 'audit/SAFE.md'));

  const ws2 = workspace('chain');
  const l2 = twoRowAttack(ws2);
  writeFileSync(join(ws2.dir, 'v.md'), verdicts([['C1', 'FALSE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'TRUE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws2.dir, 'v.md'), '--ledger', l2], { home: ws2.home }).status, 0);
  // flip the recorded copy AND the state to TRUE, re-hash the state: the record's own hash catches it
  const rec = join(ws2.dir, 'audit', '.chain', 'auditor-1.md');
  writeFileSync(rec, readFileSync(rec, 'utf8').replace('| C1 | FALSE |', '| C1 | TRUE |'));
  forge(ws2, (st) => { st.audit.verdicts.C1.verdict = 'TRUE'; }, { rehash: true });
  writeFileSync(join(ws2.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  const t = run(['record-ombudsman', join(ws2.dir, 'o.md'), '--ledger', l2], { home: ws2.home });
  assert.equal(t.status, 1);
  assert.match(t.stderr, /STATE_TAMPERED: recorded file .chain\/auditor-1.md changed after it was recorded/);
  assert.ok(!exists(ws2, 'audit/SAFE.md'));
});

test('Q1-M3 a ledger edited after start is refused with LEDGER_CHANGED; no SAFE.md for the old text', () => {
  const ws = workspace('chain');
  const ledger = twoRowAttack(ws);
  // The reviewer's edit: C2 rewritten, C3 appended, after start.
  writeFileSync(ledger, read(ws, 'opus-claims.md').replace('thing two', 'the moon is cheese') + '| C3 | added later | code | review-it@eed4dec:LICENSE:1 |\n');
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'TRUE', '`git show eed4dec:LICENSE`']]));
  const a = run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home });
  assert.equal(a.status, 1);
  assert.match(a.stderr, /LEDGER_CHANGED: .* changed since start/);
  assert.match(a.stderr, /start <claims.md> --restart/);
  assert.equal(state(ws).state, 'AUDITING', 'nothing recorded');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /LEDGER_CHANGED/);
  // Changed between the audit and the rulings: refused at record-ombudsman too.
  const ws2 = workspace('chain');
  const l2 = twoRowAttack(ws2);
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', l2], { home: ws2.home }).status, 0);
  writeFileSync(l2, read(ws2, 'opus-claims.md').replace('thing two', 'the moon is cheese'));
  writeFileSync(join(ws2.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  const o = run(['record-ombudsman', join(ws2.dir, 'o.md'), '--ledger', l2], { home: ws2.home });
  assert.equal(o.status, 1);
  assert.match(o.stderr, /LEDGER_CHANGED/);
  assert.ok(!exists(ws2, 'audit/SAFE.md'));
  // --restart audits the current ledger: three rows now.
  const r = run(['start', l2, '--auditor-model', 'sonnet', '--restart', ...REPOS], { home: ws2.home });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.dispatches[0].rows, ['C1', 'C2']);
  assert.equal(state(ws2).rows[1].claim, 'the moon is cheese');
});

test('Q1-M3 (b) status flags a published SAFE.md whose ledger has since changed', () => {
  const ws = workspace('chain');
  const ledger = twoRowAttack(ws);
  writeFileSync(join(ws.dir, 'v.md'), verdicts([['C1', 'TRUE', 'review-it@eed4dec:LICENSE:1'], ['C2', 'TRUE', '`git show eed4dec:LICENSE`']]));
  assert.equal(run(['record-audit', join(ws.dir, 'v.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(join(ws.dir, 'o.md'), rulings([['C1', 'UPHELD'], ['C2', 'UPHELD']]));
  assert.equal(run(['record-ombudsman', join(ws.dir, 'o.md'), '--ledger', ledger], { home: ws.home }).status, 0);
  assert.equal(run(['status', '--ledger', ledger], { home: ws.home }).status, 0);
  writeFileSync(ledger, read(ws, 'opus-claims.md') + '| C3 | added later | code | x |\n');
  const s = run(['status', '--ledger', ledger], { home: ws.home });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /LEDGER_CHANGED/);
});
