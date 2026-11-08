// node --test 'tests/audit/cp03-r4.test.mjs'   (from plugins/review-it)
// Regression cases for CP-03 round 4 (docs/implementation/do-it-1.1/plan/reviews/CP-03-adversarial.md,
// "Round 4", R4-Q1-M7 and §4 R4-L8). Each case replays the reviewer's commands and asserts the fix.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, run, state, cleanup, REPOS } from './helpers.mjs';
import { resolveFamily } from '../../scripts/audit-chain.mjs';

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
