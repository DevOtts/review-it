#!/usr/bin/env node
// audit-chain.mjs — the referee of /review-it --audit (CONTRACT §2.5, §3.2; G-6; D6; K2-02).
//
// The host agent dispatches the auditor and the ombudsman (SKILL.md "Audit mode"); this script never
// calls a model. It validates the ledger, refuses an auditor of the author's model (G-6), emits one
// DISPATCH line per dispatch the host must make, checks each returned file covers every requested row,
// walks the §3.2 state machine, and publishes audit/audit-<model>.md, audit/ombudsman.md and
// audit/SAFE.md only when the chain reaches PUBLISHABLE. State is persisted next to the ledger in
// audit/chain-state.json, so any session can resume with `status`.
//
//   start <claims.md> --auditor-model M [--author-model A] [--ombudsman-model O] [--stakes decision|routine]
//         [--restart] [--quarantine-published] [--repos name=path,...] [--model-family <family> | <id>=<family>,...]
//   record-audit <file> [--model M] [--tokens N] [--repos ...] [--model-family ...] [--ledger <claims.md>]
//   record-ombudsman <file> [--model O] [--tokens N] [--model-family ...] [--ledger <claims.md>]
//   abort [--reason TEXT] [--ledger <claims.md>]
//   status [--json] [--ledger <claims.md>]
//
// Without --ledger the state file is found at ./audit/chain-state.json.
// Exit: 0 ok · 1 refused (nothing changed) · 2 usage/config error · 3 ESCALATED_TO_OWNER.
// Zero dependencies, Node >= 18.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'review-it/audit-chain/2'; // 2: records + digest sidecar (CP-03 Q1-M2)
export const VERDICTS = ['TRUE', 'FALSE', 'PARTIAL', 'UNVERIFIABLE'];
// Diagram names of CONTRACT §3.2 are canonical; the table spells two of them differently.
export const STATE_ALIASES = { AUDIT_RETRY: 'AUDIT_RETRY_FAILED', REAUDIT_SAMPLE: 'PARTIAL_TRUST' };
const IN_FLIGHT = new Set(['AUDITING', 'AUDIT_RETRY_FAILED', 'AUDITED', 'ADJUDICATING', 'PARTIAL_TRUST', 'ADJUDICATED']);
const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'gpt', 'gemini', 'llama', 'mistral', 'grok', 'deepseek', 'qwen', 'codex'];
// Evidence commands (CP-03 Q1-M1). A backticked command counts as evidence only when some part of it
// runs a DATA word: a tool that reads a source (git, grep, cat, node …). Words that only print what
// they are given (echo, printf, true, :, test, date) produce no evidence on their own; shell glue
// (cd, for/do/done, if/then, env, xargs, A=b) is skipped to find the command it wraps.
const DATA_WORDS = new Set(['git', 'node', 'npm', 'npx', 'gh', 'grep', 'rg', 'ls', 'cat', 'find', 'curl', 'jq', 'sed', 'awk', 'head', 'tail', 'wc',
  'diff', 'stat', 'python', 'python3', 'doc-it', 'gate-check', 'sort', 'uniq', 'tr', 'cut', 'shasum', 'sha256sum', 'md5', 'du', 'file',
  'readlink', 'realpath', 'cmp', 'git-show', 'tree', 'nl', 'od', 'xxd', 'strings', 'less', 'more']);
const SHELLS = new Set(['bash', 'sh', 'zsh']);
const GLUE = new Set(['env', 'xargs', 'time', 'nohup', 'command', 'sudo', 'then', 'do', 'else', 'elif', '!', '(', '{', 'exec']);
// ---------- small utilities ----------
class Refusal extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }
const now = () => new Date().toISOString();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const home = () => process.env.HOME || homedir();

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k === 'json' || k === 'restart' || k === 'quarantine-published') { opt[k] = true; continue; }
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Refusal(`--${k} needs a value`, 2);
      opt[k] = v; i++;
    } else pos.push(a);
  }
  return { pos, opt };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// Model identity for G-6 (CP-03 Q1-H1: fail closed). Every model id is reduced to a FAMILY, so two
// versions of one family count as the same model: the auditor exists to be independent of the author,
// and a sibling version is not. An id that does not reduce to exactly one known family is REFUSED,
// never compared as a raw string (a raw-string compare let `opusplan` pass as "not opus").
// Normalisation: lower case; drop a context-size tag (`[1m]`, `-1m`); drop provider prefixes
// (`us.anthropic.`, `anthropic/`, `claude-`, `claude`); split on separators and letter/digit
// boundaries; the first word must be a family or a known alias, every other word a version number,
// date, provider tag or tier word. Anything else is unknown → declare it with --model-family.
// Host pointers (`default`, `best`, `inherit`) name no model at all and are refused outright.
export const MODEL_FAMILIES = {
  families: FAMILIES,
  aliases: { opusplan: 'opus', claudeopus: 'opus', claudesonnet: 'sonnet', claudehaiku: 'haiku', claudefable: 'fable', chatgpt: 'gpt' },
  pointers: ['default', 'best', 'inherit', 'auto', 'any', 'same', 'current', 'main'],
  // words allowed after the family word (versions and dates are digits and pass on their own)
  tiers: ['latest', 'preview', 'exp', 'experimental', 'thinking', 'mini', 'nano', 'pro', 'flash', 'lite', 'turbo', 'instruct', 'chat',
    'high', 'low', 'medium', 'large', 'small', 'max', 'r', 'fast', 'plan', 'codex', 'coder', 'v', 'k', 'm', 'b', 'context', 'beta', 'stable', 'ultra', 'plus'],
  prefixes: ['us', 'eu', 'apac', 'global', 'anthropic', 'claude', 'bedrock', 'vertex', 'models', 'openai', 'google', 'meta', 'x', 'ai', 'xai'],
};
// CP-03 R3-L4: lookalike ids. Before any family matching the id is NFKC-normalised (fullwidth `ｏｐｕｓ` →
// `opus`), lower-cased, and confusable Greek / Cyrillic letters are folded to the Latin letter they imitate
// (Greek `οpus` → `opus`). An id that still holds a non-ASCII character after that is refused. Separately,
// digits that sit inside a word (`0pus`, `opu5`) are read as the letters they imitate (0→o, 1→l, 5→s), and
// the letters of the whole id are read joined up (`o-p-u-s`, `o pus`): a family found either way FIXES the
// family (it can never be declared as another one), even though the id is not a known spelling of it.
const CONFUSABLES = {
  // Greek
  'α': 'a', 'β': 'b', 'γ': 'y', 'ε': 'e', 'ζ': 'z', 'η': 'n', 'ι': 'i', 'κ': 'k', 'μ': 'u', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'ς': 's',
  'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w', 'ϲ': 'c', 'ϳ': 'j', 'ά': 'a', 'έ': 'e', 'ί': 'i', 'ό': 'o', 'ύ': 'u',
  // Cyrillic
  'а': 'a', 'в': 'b', 'г': 'r', 'д': 'd', 'е': 'e', 'ё': 'e', 'з': '3', 'и': 'u', 'к': 'k', 'л': 'n', 'м': 'm', 'н': 'h', 'о': 'o', 'п': 'n',
  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'ь': 'b', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w',
  'һ': 'h', 'ӏ': 'l', 'ү': 'y', 'ɡ': 'g', 'ı': 'i', 'ȷ': 'j',
};
export function normalizeModelId(m) {
  return [...String(m || '').normalize('NFKC').trim().toLowerCase()].map((c) => CONFUSABLES[c] ?? c).join('');
}
const DIGIT_LOOKALIKE = { 0: 'o', 1: 'l', 5: 's' };
const foldDigits = (s) => s.replace(/[a-z0-9]+/g, (w) => (/[a-z]/.test(w) ? w.replace(/[015]/g, (d) => DIGIT_LOOKALIKE[d]) : w));
function familyWords(m) {
  let s = normalizeModelId(m);
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/^(?:[a-z]+[./])*(?:anthropic|openai|google|meta|xai)[./:]/, ' ').replace(/^claude(?=[a-z])/, '');
  return s.split(/[^a-z0-9]+|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/).filter(Boolean);
}
// → { family } or { error }. `declared` maps a model id (as typed) to a family name.
export function resolveFamily(m, declared = {}) {
  const id = String(m || '').trim();
  if (!id) return { error: 'empty model id' };
  const norm = normalizeModelId(id);
  const nonAscii = [...norm].filter((c) => c.charCodeAt(0) > 0x7e || c.charCodeAt(0) < 0x20);
  if (nonAscii.length)
    return { error: `model id "${id}" contains non-ASCII or control characters (${[...new Set(nonAscii)].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}) after NFKC and lookalike folding; refused, a lookalike id is never matched or declared` };
  const words = familyWords(id);
  if (words.length === 1 && MODEL_FAMILIES.pointers.includes(words[0]))
    return { error: `model id "${id}" is a host pointer, not a model; pass the concrete model id (G-6 cannot be checked against "${id}")` };
  let i = 0;
  while (i < words.length && (MODEL_FAMILIES.prefixes.includes(words[i]) || /^\d+$/.test(words[i]))) i++; // claude-3-5-sonnet
  const head = words[i];
  const fam = head && (FAMILIES.includes(head) ? head : MODEL_FAMILIES.aliases[head]);
  const tailOk = words.slice(i + 1).every((w) => /^\d+$/.test(w) || MODEL_FAMILIES.tiers.includes(w));
  const known = fam && tailOk ? fam : null;
  // CP-03 R2-Q1-M4: any word that names a family fixes the family, even when the rest of the id is not
  // understood (`opus-xl`, `claude-opus-research`), so a declaration can never relabel it. A word that
  // only CONTAINS a family name (`opusxl`) fixes it too. Two different families in one id are refused.
  // A family word that is also a tier word (`codex` in `gpt-5-codex`) counts only as the head word.
  const named = new Set();
  words.forEach((w, k) => {
    if (MODEL_FAMILIES.prefixes.includes(w) || /^\d+$/.test(w)) return;
    if (k !== i && MODEL_FAMILIES.tiers.includes(w)) return;
    if (FAMILIES.includes(w)) { named.add(w); return; }
    if (MODEL_FAMILIES.aliases[w]) { named.add(MODEL_FAMILIES.aliases[w]); return; }
    for (const f of FAMILIES) if (w.includes(f) && !(k !== i && f === 'codex')) named.add(f);
  });
  // R3-L4: digit lookalikes inside a word, and the id's letters read joined up (prefixes, numbers and
  // non-head tier words left out, so `gpt-5-codex` stays one family).
  const looks = familyWords(foldDigits(normalizeModelId(id)));
  let lh = 0;
  while (lh < looks.length && (MODEL_FAMILIES.prefixes.includes(looks[lh]) || /^\d+$/.test(looks[lh]))) lh++;
  const joined = looks.filter((w, k) => !(MODEL_FAMILIES.prefixes.includes(w) || /^\d+$/.test(w) || (k !== lh && MODEL_FAMILIES.tiers.includes(w)))).join('');
  for (const f of FAMILIES) if (joined.includes(f)) named.add(f);
  if (named.size > 1) return { error: `model id "${id}" names more than one family (${[...named].join(', ')}); refused, G-6 cannot tell which model it is` };
  const fixed = named.size ? [...named][0] : null;
  const decl = declared[id] ?? declared[id.toLowerCase()];
  if (decl !== undefined) {
    const d = String(decl).trim().toLowerCase();
    if (!FAMILIES.includes(d)) return { error: `--model-family ${id}=${decl}: "${decl}" is not a known family (${FAMILIES.join(', ')})` };
    const k = known || fixed;
    if (k && k !== d) return { error: `--model-family ${id}=${decl} contradicts the known family of ${id} (${k}); refused` };
    return { family: d };
  }
  if (known) return { family: known };
  if (fixed) return { error: `unknown model family: ${id} names the ${fixed} family but is not a known ${fixed} id; declare it with --model-family ${id}=${fixed} (no other family can be declared for it)` };
  return { error: `unknown model family: ${id}; declare it with --model-family <family> (or --model-family ${id}=<family>), one of ${FAMILIES.join(', ')}` };
}
// Lenient key for display and back-compat callers: the family, or '' when it cannot be resolved.
export function modelKey(m, declared) { return resolveFamily(m, declared).family || ''; }
// Fail closed: an unresolvable id never compares as "different".
export function familyOf(m, declared, role) {
  const r = resolveFamily(m, declared);
  if (r.error) throw new Refusal(`G-6: ${role ? `${role} ` : ''}${r.error}`);
  return r.family;
}
export const sameModel = (a, b, declared) => familyOf(a, declared) === familyOf(b, declared);
// The families declared at start, plus any --model-family on this command (for the file's model id).
function chainFamilies(st, opt, declared) {
  const fams = { ...(st.model_families || {}) };
  const unknown = resolveFamily(declared, fams).error && !MODEL_FAMILIES.pointers.includes(String(declared).trim().toLowerCase()) ? [declared] : [];
  return { ...fams, ...parseFamilyFlag(opt['model-family'], unknown) };
}
// --model-family: `fam` (applies to the one unknown model of this command) or `id=fam[,id=fam...]`.
function parseFamilyFlag(v, unknownIds) {
  if (v === undefined) return {};
  const out = {};
  for (const part of String(v).split(',').map((x) => x.trim()).filter(Boolean)) {
    const eq = part.lastIndexOf('=');
    if (eq > 0) { out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim(); continue; }
    if (unknownIds.length !== 1) throw new Refusal(`--model-family ${part}: ${unknownIds.length ? `${unknownIds.length} models are unknown (${unknownIds.join(', ')})` : 'no model in this command is unknown'}; use --model-family <id>=<family>`, 2);
    out[unknownIds[0]] = part;
  }
  return out;
}
export const modelSlug = (m) => normalizeModelId(m).replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- sibling lookups (X10 for doc-it; the same rule for plan-it) ----------
function semverCmp(a, b) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
function newestInCache(plugin, rels) {
  rels = [].concat(rels);
  const cache = join(home(), '.claude/plugins/cache');
  let best = null;
  let markets = [];
  try { markets = readdirSync(cache); } catch { return null; }
  for (const mk of markets) {
    let vers = [];
    try { vers = readdirSync(join(cache, mk, plugin)); } catch { continue; }
    for (const v of vers) {
      const p = rels.map((rel) => join(cache, mk, plugin, v, rel)).find((x) => existsSync(x));
      if (p && (!best || semverCmp(v, best.v) > 0)) best = { v, p };
    }
  }
  return best && best.p;
}
export function findDocIt() {
  if (process.env.DOC_IT_CLI) return existsSync(process.env.DOC_IT_CLI) ? process.env.DOC_IT_CLI : null;
  return newestInCache('doc-it', 'scripts/doc-it.mjs');
}
export function findGateCheck() {
  if (process.env.PLAN_IT_GATE_CHECK) return existsSync(process.env.PLAN_IT_GATE_CHECK) ? process.env.PLAN_IT_GATE_CHECK : null;
  // plan-it installs as its whole repo: the CLI sits at scripts/ and, mirrored, in the plugin folder.
  return newestInCache('plan-it', ['scripts/gate-check.mjs', 'plugins/plan-it/skills/plan-it/scripts/gate-check.mjs', 'skills/plan-it/scripts/gate-check.mjs']);
}

// ---------- parsing ----------
function splitRow(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  // Split on pipes that are not inside backticks and not escaped.
  const cells = []; let cur = '', tick = false;
  const body = t.replace(/^\|/, '').replace(/\|\s*$/, '');
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '`') tick = !tick;
    if (c === '\\' && body[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|' && !tick) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
const isSep = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c));

// Every markdown table in the text whose header names all `need` columns → rows as objects keyed by
// lower-case header names.
function tables(text, need) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const head = splitRow(lines[i]); const sep = splitRow(lines[i + 1]);
    if (!head || !sep || !isSep(sep)) continue;
    const keys = head.map((h) => h.toLowerCase().replace(/[*_`]/g, '').trim());
    if (!need.every((n) => keys.includes(n))) continue;
    let j = i + 2;
    for (; j < lines.length; j++) {
      const cells = splitRow(lines[j]);
      if (!cells) break;
      const row = {}; keys.forEach((k, x) => { row[k] = (cells[x] ?? '').trim(); });
      row._line = j + 1;
      out.push(row);
    }
    i = j - 1;
  }
  return out;
}
const cleanId = (s) => String(s || '').replace(/[*_`]/g, '').trim();
function headerValue(text, names) {
  for (const n of names) {
    const m = text.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${n}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*\`?([^\`\\s|]+)`, 'im'));
    if (m) return m[1];
  }
  return null;
}

export function parseLedger(text) {
  const rows = tables(text, ['id', 'claim', 'tier', 'source']).map((r) => ({
    id: cleanId(r.id), claim: r.claim, tier: r.tier, source: r.source, line: r._line,
  })).filter((r) => r.id);
  const author = headerValue(text, ['author model', 'author_model', 'author-model']);
  const rm = text.match(/^[ \t]*(?:[-*][ \t]*)?(?:\*\*)?repos(?:\*\*)?[ \t]*:[ \t]*([^\n]*)$/im); // R2-L7: one line only
  return { rows, author, repos: rm ? rm[1].replace(/`/g, '').trim() : null };
}

// Does this command read a data source? Splits on && || ; | and newlines, looks inside $(…) and
// `sh -c '…'`, skips env assignments and glue words, and asks whether any part runs a DATA word.
export function producesEvidence(cmd, depth = 0) {
  const c = String(cmd || '');
  if (depth > 4) return false;
  for (const m of c.matchAll(/\$\(([^()]*)\)/g)) if (producesEvidence(m[1], depth + 1)) return true;
  for (const seg of c.split(/&&|\|\||[;|\n]/)) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || GLUE.has(words[i]) || /^-/.test(words[i]) && GLUE.has(words[i - 1]))) i++;
    const w = (words[i] || '').replace(/^.*\//, '');
    // CP-03 R2-L5: `ls` and `cat` read a source only when they are given one: a path argument that is
    // not a device (`ls`, `cat /dev/null`, `cat < /dev/null` print nothing checkable).
    if (w === 'ls' || w === 'cat') {
      const args = words.slice(i + 1).filter((a, k, all) => !/^-/.test(a) && !/^[<>]/.test(a) && !/^[<>]/.test(all[k - 1] || ''));
      if (args.some((a) => !/^\/dev\//.test(a))) return true;
      continue;
    }
    if (DATA_WORDS.has(w)) return true;
    if (SHELLS.has(w)) {
      const k = words.indexOf('-c', i);
      if (k > 0 && producesEvidence(words.slice(k + 1).join(' ').replace(/^['"]|['"]$/g, ''), depth + 1)) return true;
      if (k < 0 && words[i + 1] && !/^-/.test(words[i + 1])) return true; // `bash script.sh` runs a file
    }
  }
  return false;
}
// Citations in an evidence cell: `repo@sha[:path[:line]]` and the git-show form `<sha>:<path>[:line]`.
export function citations(ev) {
  const s = String(ev || ''), out = [];
  for (const m of s.matchAll(/([A-Za-z0-9._/-]+)@([0-9a-f]{7,40})\b(?::([A-Za-z0-9._/-]*[A-Za-z0-9_/-]))?/g))
    out.push({ text: m[0], repo: m[1].replace(/^.*\//, ''), sha: m[2], path: m[3] && !/^\d+(-\d+)?$/.test(m[3]) ? m[3] : null });
  for (const m of s.matchAll(/(^|[\s`(])([0-9a-f]{7,40}):([A-Za-z0-9._/-]*[A-Za-z0-9_/-])/g))
    out.push({ text: `${m[2]}:${m[3]}`, repo: null, sha: m[2], path: m[3] });
  return out;
}
// Evidence must cite repo@sha or a command (T-Q1-01). A backticked path alone is not a command, and a
// command that reads no data source (Q1-M1: `echo TRUE`) is not evidence. Format only; see verifyEvidence.
export function evidenceOk(ev) {
  const s = String(ev || '');
  if (citations(s).length) return true;
  for (const m of s.matchAll(/`([^`]+)`/g)) if (producesEvidence(m[1].trim())) return true;
  return false;
}
// Q1-M1: every citation must resolve. A sha is looked up with `git cat-file -e` (offline, local) in the
// repos the chain knows (`Repos:` ledger header, --repos name=path). `repo@sha` is checked in that repo;
// a bare `<sha>:<path>` in every known repo. No resolvable repo → the citation is "unchecked", and an
// unchecked or missing citation leaves the row uncovered (decision stakes). → { ok, reason, checks }
const gitCache = new Map();
function gitHas(repoPath, obj) {
  const k = `${repoPath}\0${obj}`;
  if (!gitCache.has(k)) gitCache.set(k, spawnSync('git', ['-C', repoPath, 'cat-file', '-e', obj], { encoding: 'utf8' }).status === 0);
  return gitCache.get(k);
}
// CP-03 R2-L6: a declared repo counts only when its path is the top level of a git repo (so `x=` does
// not walk up to an enclosing repo) and its folder or one of its remotes carries the declared name (so
// `review-it=<do-it tree>` cannot make a do-it sha "verify" a review-it claim). → null, or why not.
const repoCache = new Map();
export function repoProblem(name, p) {
  const k = `${name}\0${p}`;
  if (repoCache.has(k)) return repoCache.get(k);
  let why = null;
  const top = p && existsSync(p) ? spawnSync('git', ['-C', p, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }) : null;
  if (!top || top.status !== 0) why = `${p} is not a git repo`;
  else {
    let real = p; try { real = realpathSync.native(p); } catch { /* keep p */ }
    let t = top.stdout.trim(); try { t = realpathSync.native(t); } catch { /* keep t */ }
    if (real !== t) why = `${p} is not the top level of a git repo (that is ${t})`;
    else {
      const strip = (u) => u.replace(/\/+$/, '').replace(/\.git$/, '').replace(/^.*[/:]/, '').toLowerCase();
      const remotes = spawnSync('git', ['-C', p, 'remote', '-v'], { encoding: 'utf8' }).stdout.split('\n').map((l) => l.split(/\s+/)[1]).filter(Boolean).map(strip);
      const n = String(name).toLowerCase();
      if (strip(t) !== n && !remotes.includes(n)) why = `neither its folder nor its origin remote is named "${name}" (${t})`;
    }
  }
  repoCache.set(k, why);
  return why;
}
export function verifyEvidence(ev, repos = {}) {
  if (!evidenceOk(ev)) return { ok: false, reason: 'evidence cites no repo@sha and no command', checks: [] };
  const usable = Object.fromEntries(Object.entries(repos).filter(([n, p]) => !repoProblem(n, p)));
  const checks = citations(ev).map((c) => {
    const obj = c.path ? `${c.sha}:${c.path}` : c.sha;
    const where = c.repo ? (usable[c.repo] ? [[c.repo, usable[c.repo]]] : []) : Object.entries(usable);
    if (!where.length) {
      const prob = c.repo && repos[c.repo] ? repoProblem(c.repo, repos[c.repo]) : null;
      return { cite: c.text, status: 'unchecked', why: prob ? `--repos ${c.repo}=${repos[c.repo]}: ${prob}` : c.repo ? `repo "${c.repo}" not known (pass --repos ${c.repo}=<path>)` : 'no repo known (pass --repos <name>=<path>)' };
    }
    const hit = where.find(([, p]) => gitHas(p, obj));
    return hit ? { cite: c.text, status: 'ok', repo: hit[0] } : { cite: c.text, status: 'missing', why: `${obj} does not exist in ${where.map(([n]) => n).join(', ')}` };
  });
  const bad = checks.filter((c) => c.status !== 'ok');
  if (bad.length) return { ok: false, reason: bad.map((c) => `${c.cite} ${c.status}: ${c.why}`).join('; '), checks };
  return { ok: true, reason: '', checks };
}
// Repos: `name=path,…` from the ledger header and --repos; relative paths resolve against `base`.
export function parseRepos(v, base) {
  const out = {};
  for (const part of String(v || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) throw new Refusal(`--repos / Repos: expects name=path, got "${part}"`, 2);
    out[part.slice(0, eq)] = resolve(base, part.slice(eq + 1));
  }
  return out;
}
const verdictWord = (v) => {
  const w = String(v || '').replace(/[*_`]/g, '').trim().toUpperCase().split(/[\s(—–:-]+/)[0];
  return VERDICTS.includes(w) ? w : null;
};

export function parseAuditFile(text) {
  const rows = tables(text, ['id', 'verdict', 'evidence']).map((r) => ({
    id: cleanId(r.id), verdict: verdictWord(r.verdict), raw: r.verdict, evidence: r.evidence,
  })).filter((r) => r.id);
  return { rows, model: headerValue(text, ['model', 'auditor model', 'auditor_model']), tokens: headerValue(text, ['tokens']) };
}
export function parseOmbudsmanFile(text) {
  const rows = tables(text, ['id', 'ruling']).map((r) => {
    const raw = String(r.ruling || '').replace(/[*_`]/g, '').trim().toUpperCase();
    const ruling = raw.startsWith('UPHELD') ? 'UPHELD' : verdictWord(raw);
    return { id: cleanId(r.id), ruling, raw: r.ruling, reason: r.reason || r.note || '', cls: r.class || '' };
  }).filter((r) => r.id);
  return { rows, model: headerValue(text, ['model', 'ombudsman model', 'ombudsman_model']), tokens: headerValue(text, ['tokens']) };
}

// ---------- tier check through doc-it (K2-02, X10, X13) ----------
// CP-03 Q1-L4: a doc-it that is configured or installed but does not answer `tiers --json` is not
// "missing": the tier check would silently not run. Print `[skip] doc-it unusable: …` and refuse (exit 2).
function resolveTiers(rows, log) {
  const env = process.env.DOC_IT_CLI;
  if (env && !existsSync(env)) {
    log(`[skip] doc-it unusable: DOC_IT_CLI=${env} does not exist; tier enum not checked`);
    throw new Refusal(`doc-it unusable: DOC_IT_CLI=${env} does not exist; fix or unset DOC_IT_CLI (a configured doc-it is never treated as not installed)`, 2);
  }
  const cli = findDocIt();
  if (!cli) { log('[skip] doc-it not installed: tier enum'); return { check: 'skipped', bad: [] }; }
  const probe = spawnSync('node', [cli, 'tiers', '--json'], { encoding: 'utf8' });
  let tiersOut = null; try { tiersOut = JSON.parse(probe.stdout); } catch { /* below */ }
  if (probe.status !== 0 || !tiersOut || !Array.isArray(tiersOut.tiers) || !tiersOut.tiers.length) {
    const why = `${cli}: \`tiers --json\` ${probe.status !== 0 ? `exit ${probe.status}${probe.stderr ? ` (${probe.stderr.trim().split('\n')[0]})` : ''}` : 'did not print a tier list'}`;
    log(`[skip] doc-it unusable: ${why}; tier enum not checked`);
    throw new Refusal(`doc-it unusable: ${why}; fix ${env ? 'DOC_IT_CLI' : 'the doc-it install'} (an unusable doc-it is never treated as not installed)`, 2);
  }
  const bad = [];
  for (const r of rows) {
    if (!r.tier.trim()) { bad.push(`${r.id}: empty tier`); continue; }
    const p = spawnSync('node', [cli, 'tiers', 'resolve', r.tier], { encoding: 'utf8' });
    let out = null; try { out = JSON.parse(p.stdout); } catch { /* reported below */ }
    if (p.status !== 0 || !out || !Array.isArray(out.parts) || (out.unknown && out.unknown.length)) {
      bad.push(`${r.id}: tier "${r.tier}" ${out && out.unknown && out.unknown.length ? `has unknown part ${out.unknown.map((u) => `"${u}"`).join(', ')}` : `not resolved by doc-it (${(p.stderr || '').trim() || `exit ${p.status}`})`}`);
      continue;
    }
    r.tier_ids = [...new Set(out.parts.map((x) => x.id))];
  }
  return { check: 'doc-it', cli, bad };
}

// ---------- state ----------
const statePath = (ledger) => join(dirname(ledger), 'audit', 'chain-state.json');
const auditDir = (st) => join(dirname(st.ledger), 'audit');
// Integrity (CP-03 Q1-M2). The state is bound three ways:
//  1. every recorded verdict / rulings file is copied to audit/.chain/<role>-<n>.md and its sha256 kept
//     in st.records;
//  2. a sidecar audit/chain-state.sha256 holds a digest over the state text, the ledger sha256 and the
//     record hashes; every command re-checks it;
//  3. before publishing, verifyChain() re-derives every verdict and ruling from the record copies and the
//     ledger, and refuses unless they equal the state's (so a re-hashed forgery still fails).
// Any mismatch refuses with STATE_TAMPERED; the way out is `start <ledger> --restart`.
const digestPath = (f) => join(dirname(f), 'chain-state.sha256');
export const chainDigest = (text, st) => sha256(`${SCHEMA}\n${text}\n${st.ledger_sha256}\n${(st.records || []).map((r) => r.sha256 || '-').join('\n')}`);
const tampered = (msg) => new Refusal(`STATE_TAMPERED: ${msg}; nothing recorded or published. Restart the chain with \`start <claims.md> --restart\``);
function loadState(opt, { check = true } = {}) {
  const f = opt.ledger ? statePath(resolve(opt.ledger)) : resolve('audit/chain-state.json');
  if (!existsSync(f)) throw new Refusal(`no audit chain state at ${f} (run start first, or pass --ledger)`, 2);
  let text, st; try { text = readFileSync(f, 'utf8'); st = JSON.parse(text); } catch (e) { throw new Refusal(`chain state unreadable: ${f}: ${e.message}`, 2); }
  if (st.schema !== SCHEMA) throw new Refusal(`chain state ${f} has schema ${st.schema}, expected ${SCHEMA}; run \`start <claims.md> --restart\``, 2);
  if (check) {
    const d = existsSync(digestPath(f)) ? readFileSync(digestPath(f), 'utf8').trim() : null;
    if (!d) throw tampered(`${digestPath(f)} is missing`);
    if (d !== chainDigest(text, st)) throw tampered(`${f} does not match its digest (edited by hand?)`);
  }
  return { st, file: f };
}
// CP-03 Q1-M3: the ledger a chain audits is the ledger as it was at start. Re-checked by every command;
// a changed (or deleted) ledger refuses with LEDGER_CHANGED, since a SAFE list for the old text would
// be read as covering the new one.
function ledgerChanged(st) {
  const t = existsSync(st.ledger) ? readFileSync(st.ledger, 'utf8') : null;
  if (t === null) return `${st.ledger} no longer exists`;
  const now_ = sha256(t);
  return now_ === st.ledger_sha256 ? null : `${st.ledger} changed since start (sha256 ${st.ledger_sha256.slice(0, 12)}… at start, ${now_.slice(0, 12)}… now)`;
}
const ledgerRefusal = (why) => new Refusal(`LEDGER_CHANGED: ${why}; nothing recorded or published. Re-audit the current ledger with \`start <claims.md> --restart\``);
function requireLedger(st) { const why = ledgerChanged(st); if (why) throw ledgerRefusal(why); }
function saveState(file, st) {
  const text = JSON.stringify(st, null, 2) + '\n';
  writeAtomic(file, text);
  writeAtomic(digestPath(file), chainDigest(text, st) + '\n');
}
// Copy a recorded file into the chain's own record set; return its record entry.
function keepRecord(st, role, text, src, requested, model) {
  const n = st.records.filter((r) => r.role === role).length + 1;
  const rel = join('.chain', `${role}-${n}.md`);
  writeAtomic(join(auditDir(st), rel), text);
  const rec = { role, n, file: rel, source: src, sha256: sha256(text), requested: [...requested], model, at: now() };
  st.records.push(rec);
  return rec;
}
// Re-derive the chain from the ledger and the record copies; refuse unless the state agrees.
function verifyChain(st) {
  requireLedger(st);
  const lt = readFileSync(st.ledger, 'utf8');
  const rows = parseLedger(lt).rows;
  const same = rows.length === st.rows.length && rows.every((r, i) => ['id', 'claim', 'tier', 'source'].every((k) => r[k] === st.rows[i][k]));
  if (!same) throw tampered('the state\'s rows are not the ledger\'s rows');
  const ids = new Set(rows.map((r) => r.id));
  const fams = st.model_families || {};
  const verdicts = {}, rulings = {};
  let nA = 0, nO = 0;
  for (const rec of st.records || []) {
    if (!rec.sha256) { if (rec.role === 'auditor') continue; throw tampered(`record ${rec.file || '?'} has no hash`); }
    const p = join(auditDir(st), rec.file || '');
    if (!rec.file || !existsSync(p)) throw tampered(`recorded file ${rec.file} is missing`);
    const text = readFileSync(p, 'utf8');
    if (sha256(text) !== rec.sha256) throw tampered(`recorded file ${rec.file} changed after it was recorded`);
    if (rec.role === 'auditor') {
      nA++;
      const parsed = parseAuditFile(text);
      const m = rec.model || parsed.model;
      if (familyOf(m, fams) === familyOf(st.author_model, fams) || familyOf(m, fams) !== familyOf(st.auditor_model, fams)) throw tampered(`${rec.file} is from ${m}, not the chain's auditor`);
      const byId = new Map(parsed.rows.map((r) => [r.id, r]));
      for (const id of rec.requested) {
        const r = byId.get(id);
        if (ids.has(id) && r && r.verdict && verifyEvidence(r.evidence, st.repos || {}).ok) verdicts[id] = { verdict: r.verdict, evidence: r.evidence };
      }
    } else if (rec.role === 'ombudsman') {
      nO++;
      const parsed = parseOmbudsmanFile(text);
      const m = rec.model || parsed.model;
      if (familyOf(m, fams) !== familyOf(st.ombudsman_model, fams)) throw tampered(`${rec.file} is from ${m}, not the chain's ombudsman`);
      const byId = new Map(parsed.rows.map((r) => [r.id, r]));
      for (const id of rec.requested) {
        const r = byId.get(id);
        if (!r || !r.ruling) throw tampered(`${rec.file} has no ruling for ${id}`);
        rulings[id] = { ruling: r.ruling, final: r.ruling === 'UPHELD' ? (verdicts[id] || {}).verdict || null : r.ruling, reason: r.reason };
      }
    } else throw tampered(`record of unknown role ${rec.role}`);
  }
  if (!nA || !nO) throw tampered(`no recorded ${!nA ? 'auditor' : 'ombudsman'} file; a chain publishes only what it recorded itself`);
  for (const r of rows) {
    const v = verdicts[r.id], sv = st.audit.verdicts[r.id], ru = rulings[r.id], sr = st.rulings[r.id];
    if (!v) throw tampered(`${r.id} has no verdict in any recorded auditor file`);
    if (!sv || sv.verdict !== v.verdict || sv.evidence !== v.evidence) throw tampered(`${r.id}: the state's verdict is not the recorded one`);
    if (!ru) throw tampered(`${r.id} has no ruling in any recorded ombudsman file`);
    if (!sr || sr.ruling !== ru.ruling || sr.final !== ru.final || (sr.reason || '') !== (ru.reason || '')) throw tampered(`${r.id}: the state's ruling is not the recorded one`);
  }
}
function move(st, to, event, extra = {}) {
  st.history.push({ from: st.state, to, event, at: now(), ...extra });
  st.state = to;
}
function dispatch(st, role, rows, purpose) {
  const n = st.dispatches.filter((d) => d.role === role).length + 1;
  const req = {
    role, purpose,
    model: role === 'auditor' ? st.auditor_model : st.ombudsman_model,
    ledger: st.ledger,
    rows,
    write_to: join(auditDir(st), '.work', `${role}-${n}.md`),
    inputs: role === 'ombudsman' ? [join(auditDir(st), '.work', 'audit-merged.md')] : [],
  };
  st.dispatches.push({ ...req, at: now() });
  st.pending = req;
  return req;
}
const emit = (req, out) => out(`DISPATCH ${JSON.stringify(req)}`);

function classOf(st, id) {
  const r = st.rows.find((x) => x.id === id);
  return r ? (r.tier_ids && r.tier_ids.length ? r.tier_ids : [r.tier.trim()]) : [];
}
const finalAuditVerdict = (st, id) => (st.audit.verdicts[id] || {}).verdict || null;

function mergedAuditMd(st, title) {
  const lines = [`# ${title}`, '', `model: ${st.auditor_model}`, `ledger: ${relative(auditDir(st), st.ledger)}`, `ledger_sha256: ${st.ledger_sha256}`,
    `author model: ${st.author_model}`, `tier check: ${st.tier_check === 'doc-it' ? 'doc-it tiers resolve' : '[skip] doc-it not installed: tier enum'}`, '',
    '| ID | Tier | Verdict | Evidence | Round |', '|---|---|---|---|---|'];
  for (const r of st.rows) {
    const v = st.audit.verdicts[r.id];
    lines.push(`| ${r.id} | ${r.tier} | ${v ? v.verdict : '—'} | ${v ? v.evidence.replace(/\|/g, '\\|') : '—'} | ${v ? v.round : '—'} |`);
  }
  return lines.join('\n') + '\n';
}

function publish(st, log) {
  verifyChain(st);
  const dir = auditDir(st);
  const slug = modelSlug(st.auditor_model);
  const safe = [], dnp = [];
  for (const r of st.rows) {
    const ru = st.rulings[r.id];
    const fin = ru ? ru.final : finalAuditVerdict(st, r.id);
    (fin === 'TRUE' ? safe : dnp).push({ r, fin, why: ru ? ru.reason : '' });
  }
  const sum = (role) => {
    const ts = st.tokens[role];
    return ts.length && ts.every((t) => Number.isFinite(t)) ? String(ts.reduce((a, b) => a + b, 0)) : (ts.length ? `${ts.filter(Number.isFinite).reduce((a, b) => a + b, 0)} (some dispatches did not report tokens)` : 'not reported');
  };
  const audit = mergedAuditMd(st, `Audit of ${relative(dir, st.ledger)} by ${st.auditor_model}`);
  const omb = [`# Ombudsman rulings on ${relative(dir, st.ledger)}`, '', `model: ${st.ombudsman_model}`, `auditor: ${st.auditor_model}`, '',
    '| ID | Tier | Auditor | Ruling | Final | Reason |', '|---|---|---|---|---|---|',
    ...st.rows.map((r) => { const ru = st.rulings[r.id] || {}; return `| ${r.id} | ${r.tier} | ${finalAuditVerdict(st, r.id) || '—'} | ${ru.ruling || '—'} | ${ru.final || '—'} | ${(ru.reason || '').replace(/\|/g, '\\|')} |`; }),
    '', ...(st.recheck.classes.length ? [`Re-audited classes (PARTIAL_TRUST): ${st.recheck.classes.join(', ')}`] : ['No TRUE verdict was overturned.'])].join('\n') + '\n';
  const safeMd = [`# SAFE — ${relative(dir, st.ledger)}`, '', `Chain: author ${st.author_model} → auditor ${st.auditor_model} → ombudsman ${st.ombudsman_model}. Ledger sha256 ${st.ledger_sha256}.`,
    `Tier check: ${st.tier_check === 'doc-it' ? 'every row resolved by doc-it' : '[skip] doc-it not installed: tier enum (not checked, not PASS)'}.`, '',
    `## SAFE (${safe.length})`, '', ...(safe.length ? safe.map(({ r }) => `- ${r.id} — ${r.claim}`) : ['- none']), '',
    `## DO-NOT-PUBLISH (${dnp.length})`, '', ...(dnp.length ? dnp.map(({ r, fin, why }) => `- ${r.id} (${fin || 'no verdict'}) — ${r.claim}${why ? ` — ${why}` : ''}`) : ['- none']), '',
    '## Tokens per role', '', '| Role | Model | Dispatches | Tokens |', '|---|---|---|---|',
    `| auditor | ${st.auditor_model} | ${st.dispatches.filter((d) => d.role === 'auditor').length} | ${sum('auditor')} |`,
    `| ombudsman | ${st.ombudsman_model} | ${st.dispatches.filter((d) => d.role === 'ombudsman').length} | ${sum('ombudsman')} |`, ''].join('\n');
  writeAtomic(join(dir, `audit-${slug}.md`), audit);
  writeAtomic(join(dir, 'ombudsman.md'), omb);
  writeAtomic(join(dir, 'SAFE.md'), safeMd); // written last: SAFE.md present = the set is complete
  rmSync(join(dir, '.work'), { recursive: true, force: true });
  // CP-03 R2-Q1-M5: the hash of each published file is kept in the state (so the chain digest covers it);
  // `status` re-hashes them and refuses with PUBLISHED_TAMPERED after a hand edit.
  const files = { [`audit-${slug}.md`]: audit, 'ombudsman.md': omb, 'SAFE.md': safeMd };
  st.published = { at: now(), files: Object.keys(files), sha256: Object.fromEntries(Object.entries(files).map(([f, t]) => [f, sha256(t)])),
    safe: safe.map((x) => x.r.id), do_not_publish: dnp.map((x) => x.r.id) };
  log(`published audit/audit-${slug}.md, audit/ombudsman.md, audit/SAFE.md — SAFE ${safe.length}, DO-NOT-PUBLISH ${dnp.length}`);
}

// CP-03 Q1-L3: one row per id. Two rows for one id (C1 TRUE, then C1 FALSE) is refused, not first-wins.
function refuseDuplicates(rows, name, what) {
  const dup = [...new Set(rows.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i))];
  if (dup.length) throw new Refusal(`${name}: more than one ${what} row for ${dup.join(', ')}; not recorded, the file must give one ${what} per id`);
}
function tokensOf(opt, parsed) {
  const t = opt.tokens ?? parsed.tokens;
  if (t === undefined || t === null) return null;
  const n = Number(String(t).replace(/[,_]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ---------- commands ----------
function cmdStart(pos, opt, out, log) {
  const ledgerArg = pos[0];
  if (!ledgerArg) throw new Refusal('usage: start <claims.md> --auditor-model M [--author-model A] [--stakes decision|routine]', 2);
  const ledger = resolve(ledgerArg);
  if (!existsSync(ledger)) throw new Refusal(`ledger not found: ${ledger}`, 2);
  const stakes = opt.stakes || 'decision';
  if (!['decision', 'routine'].includes(stakes)) throw new Refusal(`--stakes must be decision or routine, got ${stakes}`, 2);

  // D6 / Q1-04: routine stakes get the ledger lint only. No subagent, no chain state.
  if (stakes === 'routine') {
    const gc = findGateCheck();
    if (!gc) { log('[skip] plan-it not installed: gate-check claims'); out('routine: gate-check claims not run, plan-it missing; the ledger is unchecked'); return 0; }
    const p = spawnSync('node', [gc, 'claims', ledger], { encoding: 'utf8' });
    if (p.stdout) process.stdout.write(p.stdout);
    if (p.stderr) process.stderr.write(p.stderr);
    out(`routine: gate-check claims exit ${p.status} — ${p.status === 0 ? 'PASS' : 'FAIL'}; no auditor or ombudsman dispatched (D6)`);
    return p.status === 0 ? 0 : 1;
  }

  const text = readFileSync(ledger, 'utf8');
  const { rows, author, repos: headerRepos } = parseLedger(text);
  const repos = { ...parseRepos(headerRepos, dirname(ledger)), ...parseRepos(opt.repos, process.cwd()) };
  if (!rows.length) throw new Refusal(`${ledgerArg}: no ledger table with ID | Claim | Tier | Source columns`);
  const dup = rows.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) throw new Refusal(`${ledgerArg}: duplicate row id(s) ${[...new Set(dup)].join(', ')}`);

  const authorModel = opt['author-model'] || author;
  if (!authorModel) throw new Refusal('author model unknown: add "Author model: <model>" to the ledger header or pass --author-model (G-6 cannot be checked without it)');
  const auditorModel = opt['auditor-model'];
  if (!auditorModel) throw new Refusal('--auditor-model is required (the auditor must be a different model from the author, G-6)', 2);
  const ombudsmanModel = opt['ombudsman-model'] || 'opus';
  // Q1-H1: every model of the chain must resolve to a known family, or be declared; fail closed.
  const models = [...new Set([author, opt['author-model'], auditorModel, ombudsmanModel].filter(Boolean))];
  const families = parseFamilyFlag(opt['model-family'], models.filter((m) => resolveFamily(m).error && !MODEL_FAMILIES.pointers.includes(String(m).trim().toLowerCase())));
  const fam = {};
  for (const [m, role] of [[author, 'ledger author'], [opt['author-model'], 'author'], [auditorModel, 'auditor'], [ombudsmanModel, 'ombudsman']]) {
    if (m) fam[role] = familyOf(m, families, `${role} model:`);
  }
  if (author && opt['author-model'] && fam['ledger author'] !== fam.author)
    throw new Refusal(`author model conflict: ledger header says ${author}, --author-model says ${opt['author-model']}`);
  if (fam.auditor === (fam.author || fam['ledger author']))
    throw new Refusal(`G-6: auditor model ${auditorModel} is the author's model (${authorModel}; family ${fam.auditor}); refused before dispatch, nothing written`);

  const sf = statePath(ledger);
  let prev = null, keptPublished = null;
  if (existsSync(sf)) {
    let prevText = null;
    try { prevText = readFileSync(sf, 'utf8'); prev = JSON.parse(prevText); } catch { prev = null; }
    // R2-Q1-M5: the published files a restart keeps stay bound to their hashes, but only when the old
    // state still matches its digest (a forged old state cannot hand its hashes to the new chain).
    const pd = existsSync(digestPath(sf)) ? readFileSync(digestPath(sf), 'utf8').trim() : null;
    if (prev && prev.schema === SCHEMA && pd && pd === chainDigest(prevText, prev)) {
      const h = recordedHashes(prev).all;
      if (Object.keys(h).length) keptPublished = { ...((prev.published && prev.published.sha256 ? prev.published : prev.kept_published) || {}), sha256: h };
    }
    if (prev && !opt.restart && (IN_FLIGHT.has(prev.state) || prev.state === 'ESCALATED_TO_OWNER'))
      throw new Refusal(`a chain is ${prev.state} for this ledger; finish it, run abort, or \`start <claims.md> --restart\``);
  }
  // CP-03 R3-Q1-M6: a published file that no valid recorded hash covers is UNBOUND (forged, or left by a
  // chain whose state is gone or tampered). A new chain never adopts it as "the last published version":
  // start refuses and names it, or with --quarantine-published moves it out of audit/ first.
  const aDir = dirname(sf);
  const unbound = unboundPublished(aDir, (keptPublished && keptPublished.sha256) || {});
  if (unbound.length && !opt['quarantine-published'])
    throw new Refusal(`${unboundMsg(unbound, keptPublished ? 'their bytes differ from the recorded hash, or no hash names them' : (existsSync(sf) ? 'the chain state is unreadable, tampered or of another schema' : 'there is no chain state'))}; nothing started. Inspect ${unbound.length === 1 ? 'it' : 'them'}, then re-run with --quarantine-published to move ${unbound.length === 1 ? 'it' : 'them'} to audit/.quarantine/<timestamp>/ and start`);
  if (opt.restart && existsSync(sf)) log(`restart: discarding the chain in state ${prev ? prev.state : '(unreadable)'}; published audit/ files bound to a recorded hash are kept as they are`);

  const tiers = resolveTiers(rows, log);
  if (tiers.bad.length) throw new Refusal(`tier refused (doc-it enum, K2-02):\n  ${tiers.bad.join('\n  ')}`);

  const st = {
    schema: SCHEMA, ledger, ledger_sha256: sha256(text), stakes,
    author_model: authorModel, auditor_model: auditorModel, ombudsman_model: ombudsmanModel,
    model_families: families, repos, families: { author: fam.author || fam['ledger author'], auditor: fam.auditor, ombudsman: fam.ombudsman },
    tier_check: tiers.check,
    rows: rows.map(({ id, claim, tier, source, tier_ids }) => ({ id, claim, tier, source, tier_ids: tier_ids || null })),
    state: 'LEDGER_READY',
    audit: { round: 'initial', attempt: 1, requested: rows.map((r) => r.id), verdicts: {}, files: [] },
    recheck: { classes: [], rows: [] },
    rulings: {}, ombudsman: { round: 0, files: [], requested: [] },
    tokens: { auditor: [], ombudsman: [] },
    dispatches: [], pending: null, published: false, kept_published: keptPublished, records: [],
    history: [...((prev && Array.isArray(prev.history) && prev.history) || []), { from: prev ? prev.state : null, to: 'LEDGER_READY', event: opt.restart ? 'restart: ledger read' : 'ledger read', at: now(), rows: rows.length }],
  };
  if (unbound.length) {
    const q = join(aDir, '.quarantine', now().replace(/[:.]/g, '-'));
    mkdirSync(q, { recursive: true });
    for (const f of unbound) renameSync(join(aDir, f), join(q, f));
    if (keptPublished) {
      keptPublished.sha256 = Object.fromEntries(Object.entries(keptPublished.sha256).filter(([f]) => !unbound.includes(f)));
      if (!Object.keys(keptPublished.sha256).length) st.kept_published = null;
    }
    st.history[st.history.length - 1].quarantined = { dir: relative(aDir, q), files: unbound };
    log(`quarantined ${unbound.map((f) => `audit/${f}`).join(', ')} → ${relative(dirname(aDir), q)}/ (PUBLISHED_UNBOUND; not deleted)`);
  }
  for (const d of ['.work', '.chain']) rmSync(join(dirname(sf), d), { recursive: true, force: true });
  const req = dispatch(st, 'auditor', st.audit.requested, 'audit every row from primary sources');
  move(st, 'AUDITING', 'dispatch auditor');
  saveState(sf, st);
  log(`ledger ${rows.length} rows; author ${authorModel}; auditor ${auditorModel}; ombudsman ${ombudsmanModel}; state AUDITING`);
  emit(req, out);
  return 0;
}

function cmdRecordAudit(pos, opt, out, log) {
  const { st, file } = loadState(opt);
  requireLedger(st);
  if (!['AUDITING', 'PARTIAL_TRUST'].includes(st.state)) throw new Refusal(`record-audit is not valid in state ${st.state}`);
  const vf = pos[0] ? resolve(pos[0]) : null;
  const text = vf && existsSync(vf) ? readFileSync(vf, 'utf8') : null;
  const parsed = text ? parseAuditFile(text) : { rows: [], model: null, tokens: null };
  if (text) {
    const declared = opt.model || parsed.model;
    if (!declared) throw new Refusal(`${pos[0]}: no "model:" line and no --model; cannot tell who wrote the verdicts`);
    const fams = chainFamilies(st, opt, declared);
    const f = familyOf(declared, fams, 'verdict file model:');
    if (f === familyOf(st.author_model, fams)) throw new Refusal(`G-6: verdict file is from ${declared}, the author's model (${st.author_model}); not recorded`);
    if (f !== familyOf(st.auditor_model, fams)) throw new Refusal(`verdict file is from ${declared}, but the dispatched auditor is ${st.auditor_model}`);
  }
  refuseDuplicates(parsed.rows, pos[0], 'verdict');
  st.tokens.auditor.push(text ? tokensOf(opt, parsed) : null);
  st.audit.files.push({ file: vf, at: now(), present: !!text });
  if (opt.repos) st.repos = { ...(st.repos || {}), ...parseRepos(opt.repos, process.cwd()) };
  if (text) keepRecord(st, 'auditor', text, vf, st.audit.requested, opt.model || null);
  else st.records.push({ role: 'auditor', file: null, source: vf, sha256: null, requested: [...st.audit.requested], at: now() });

  const requested = st.audit.requested;
  const byId = new Map();
  for (const r of parsed.rows) if (!byId.has(r.id)) byId.set(r.id, r);
  const uncovered = [];
  const repos = st.repos || {};
  const checked = new Map();
  for (const id of requested) {
    const r = byId.get(id);
    if (!r) { uncovered.push(`${id} (no row)`); continue; }
    if (!r.verdict) { uncovered.push(`${id} (verdict "${r.raw}" not one of ${VERDICTS.join('|')})`); continue; }
    const v = verifyEvidence(r.evidence, repos);
    checked.set(id, v);
    if (!v.ok) { uncovered.push(`${id} (${v.reason})`); continue; }
  }
  const unknown = parsed.rows.filter((r) => !st.rows.some((x) => x.id === r.id)).map((r) => r.id);
  if (unknown.length) log(`note: verdict rows not in the ledger ignored: ${unknown.join(', ')}`);
  // Keep every valid requested verdict, even on a miss, so the retry asks only for what is missing.
  const round = st.state === 'PARTIAL_TRUST' ? 'recheck' : (st.audit.attempt > 1 ? 'retry' : 'initial');
  for (const id of requested) {
    const r = byId.get(id);
    if (r && r.verdict && checked.get(id) && checked.get(id).ok) st.audit.verdicts[id] = { verdict: r.verdict, evidence: r.evidence, round, checks: checked.get(id).checks };
  }
  const missing = requested.filter((id) => !(st.audit.verdicts[id] && (round !== 'recheck' || st.audit.verdicts[id].round === 'recheck')));

  if (missing.length) {
    const wasRecheck = st.state === 'PARTIAL_TRUST';
    if (st.audit.attempt >= 2) {
      move(st, 'AUDIT_RETRY_FAILED', text ? 'rows missing' : 'verdict file missing', { missing });
      move(st, 'ESCALATED_TO_OWNER', 'second miss', { missing });
      st.pending = null;
      saveState(file, st);
      log(`ESCALATED_TO_OWNER: the re-dispatch still missed ${missing.join(', ')}; nothing published`);
      for (const u of uncovered) log(`  uncovered: ${u}`);
      out('state ESCALATED_TO_OWNER');
      return 3;
    }
    move(st, 'AUDIT_RETRY_FAILED', text ? 'rows missing' : 'verdict file missing', { missing });
    for (const u of uncovered) log(`  uncovered: ${u}`);
    st.audit.attempt = 2;
    st.audit.requested = missing;
    const req = dispatch(st, 'auditor', missing, wasRecheck ? 're-dispatch the missing re-check rows' : 're-dispatch the missing rows only');
    move(st, wasRecheck ? 'PARTIAL_TRUST' : 'AUDITING', 're-dispatch missing rows', { rows: missing });
    saveState(file, st);
    log(`AUDIT_RETRY_FAILED: ${missing.length} row(s) missing; one re-dispatch with ${missing.join(', ')}`);
    emit(req, out);
    return 0;
  }

  mkdirSync(join(auditDir(st), '.work'), { recursive: true });
  writeAtomic(join(auditDir(st), '.work', 'audit-merged.md'), mergedAuditMd(st, 'Merged auditor verdicts (work file, not published)'));
  let req;
  if (st.state === 'PARTIAL_TRUST') {
    req = dispatch(st, 'ombudsman', st.recheck.rows, `rule on the re-checked class(es) ${st.recheck.classes.join(', ')}`);
    st.ombudsman.requested = st.recheck.rows;
    move(st, 'ADJUDICATING', 'auditor re-checked that class', { rows: st.recheck.rows });
  } else {
    move(st, 'AUDITED', 'all rows covered');
    req = dispatch(st, 'ombudsman', st.rows.map((r) => r.id), 'rule on every auditor verdict');
    st.ombudsman.requested = st.rows.map((r) => r.id);
    move(st, 'ADJUDICATING', 'dispatch ombudsman');
  }
  saveState(file, st);
  emit(req, out);
  return 0;
}

function cmdRecordOmbudsman(pos, opt, out, log) {
  const { st, file } = loadState(opt);
  requireLedger(st);
  if (st.state !== 'ADJUDICATING') throw new Refusal(`record-ombudsman is not valid in state ${st.state}`);
  const of = pos[0] ? resolve(pos[0]) : null;
  if (!of || !existsSync(of)) throw new Refusal(`rulings file not found: ${pos[0] || '(none)'}; state stays ADJUDICATING`);
  const otext = readFileSync(of, 'utf8');
  const parsed = parseOmbudsmanFile(otext);
  if (!parsed.rows.length) throw new Refusal(`${pos[0]}: no ruling rows (a table | ID | Ruling | Reason |); state stays ADJUDICATING`);
  refuseDuplicates(parsed.rows, pos[0], 'ruling');
  if (!st.ombudsman.requested.length) throw tampered('the ombudsman was asked to rule on no rows');
  const declared = opt.model || parsed.model;
  if (!declared) throw new Refusal(`${pos[0]}: no "model:" line and no --model`);
  const fams = chainFamilies(st, opt, declared);
  if (familyOf(declared, fams, 'rulings file model:') !== familyOf(st.ombudsman_model, fams)) throw new Refusal(`rulings are from ${declared}, but the ombudsman is ${st.ombudsman_model} (D6)`);
  const byId = new Map(parsed.rows.map((r) => [r.id, r]));
  const bad = st.ombudsman.requested.filter((id) => { const r = byId.get(id); return !r || !r.ruling; });
  if (bad.length) throw new Refusal(`rulings missing or unreadable for ${bad.join(', ')} (ruling must be UPHELD or ${VERDICTS.join('|')}); state stays ADJUDICATING, re-dispatch the ombudsman`);
  st.tokens.ombudsman.push(tokensOf(opt, parsed));
  st.ombudsman.round += 1;
  st.ombudsman.files.push({ file: of, at: now() });
  keepRecord(st, 'ombudsman', otext, of, st.ombudsman.requested, opt.model || null);

  const overturned = [];
  for (const id of st.ombudsman.requested) {
    const r = byId.get(id);
    const auditV = finalAuditVerdict(st, id);
    const fin = r.ruling === 'UPHELD' ? auditV : r.ruling;
    st.rulings[id] = { ruling: r.ruling, final: fin, reason: r.reason, round: st.ombudsman.round };
    if (auditV === 'TRUE' && fin !== 'TRUE') overturned.push(id);
  }
  // A class is re-sampled once; an overturn in an already re-audited class is final.
  const classes = [...new Set(overturned.flatMap((id) => {
    const r = byId.get(id); return r.cls ? [r.cls] : classOf(st, id);
  }))].filter((c) => !st.recheck.classes.includes(c));
  if (classes.length) {
    const sample = st.rows.filter((r) => !overturned.includes(r.id) && finalAuditVerdict(st, r.id) === 'TRUE'
      && classOf(st, r.id).some((c) => classes.includes(c))).map((r) => r.id);
    st.recheck.classes.push(...classes);
    move(st, 'PARTIAL_TRUST', 'a TRUE verdict overturned', { overturned, classes });
    if (!sample.length) {
      move(st, 'ADJUDICATING', 'auditor re-checks that class: no other TRUE row in it', { classes });
      log(`PARTIAL_TRUST: overturned ${overturned.join(', ')}; class ${classes.join(', ')} has no other TRUE row to re-check`);
    } else {
      st.recheck.rows = sample;
      st.audit.attempt = 1;
      st.audit.requested = sample;
      const req = dispatch(st, 'auditor', sample, `re-check class ${classes.join(', ')}: a TRUE verdict in it was overturned (${overturned.join(', ')})`);
      saveState(file, st);
      log(`PARTIAL_TRUST: ombudsman overturned TRUE on ${overturned.join(', ')}; auditor re-checks ${sample.join(', ')}`);
      emit(req, out);
      return 0;
    }
  }
  move(st, 'ADJUDICATED', 'rulings written');
  st.pending = null;
  publish(st, log);
  move(st, 'PUBLISHABLE', 'SAFE list written');
  saveState(file, st);
  out('state PUBLISHABLE');
  return 0;
}

function cmdAbort(pos, opt, out, log) {
  const { st, file } = loadState(opt);
  if (st.state === 'PUBLISHABLE') throw new Refusal('the chain already published; nothing to abort (start a new chain to re-audit)');
  if (st.state === 'LEDGER_READY') throw new Refusal('no chain in flight; nothing to abort');
  const from = st.state;
  move(st, 'ABORTED', 'owner abort', { reason: opt.reason || null });
  // ROLLBACK: nothing is republished; the work files go, the last published audit/ files stay as they were.
  for (const d of ['.work', '.chain']) rmSync(join(auditDir(st), d), { recursive: true, force: true });
  st.pending = null;
  st.aborted = { at: now(), from, reason: opt.reason || null };
  move(st, 'LEDGER_READY', 'rollback: keep last published version');
  saveState(file, st);
  const kept = existsSync(join(auditDir(st), 'SAFE.md')) ? 'the last published SAFE.md is kept unchanged' : 'no SAFE.md was ever published';
  log(`ABORTED from ${from}; rolled back to LEDGER_READY; ${kept}`);
  out('state ABORTED → LEDGER_READY');
  return 0;
}

// CP-03 R2-Q1-M5: published files whose bytes differ from the hash recorded at publish (or are gone).
// The recorded hashes are this chain's `published` ones plus the `kept_published` ones a restart carried
// over; once this chain has published, a carried-over file that is gone is not reported (it was replaced).
export function recordedHashes(st) {
  const pub = st.published && st.published.sha256 ? st.published.sha256 : {};
  const kept = st.kept_published && st.kept_published.sha256 ? st.kept_published.sha256 : {};
  return { all: { ...kept, ...pub }, pub };
}
export function publishedTampered(st) {
  const { all, pub } = recordedHashes(st);
  const bad = [];
  for (const [f, h] of Object.entries(all)) {
    const p = join(auditDir(st), f);
    if (!existsSync(p)) { if (!Object.keys(pub).length || f in pub) bad.push({ file: f, why: 'is missing' }); continue; }
    if (sha256(readFileSync(p, 'utf8')) !== h) bad.push({ file: f, why: 'does not match the sha256 recorded at publish (edited by hand?)' });
  }
  return bad;
}
// CP-03 R3-Q1-M6: the files a chain publishes, as found on disk in audit/ (SAFE.md, ombudsman.md,
// audit-*.md at its top level; never the state, the record copies, the work files or a quarantine).
export const isPublishedName = (f) => f === 'SAFE.md' || f === 'ombudsman.md' || /^audit-.+\.md$/.test(f);
export function publishedOnDisk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => isPublishedName(f) && statSync(join(dir, f)).isFile()).sort();
}
// A published file is BOUND only when a recorded hash in a state that passes its digest covers its
// exact bytes. Anything else (no state, a tampered state, a file no hash names, a file whose bytes
// differ) is UNBOUND: nothing vouches for it, so it must never be read as "the last published version".
export function unboundPublished(dir, hashes = {}) {
  return publishedOnDisk(dir).filter((f) => !(f in hashes) || sha256(readFileSync(join(dir, f), 'utf8')) !== hashes[f]);
}
const unboundMsg = (files, how) => `PUBLISHED_UNBOUND: ${files.map((f) => `audit/${f}`).join(', ')} ${files.length === 1 ? 'is' : 'are'} not covered by any hash recorded in a valid chain state (${how}); do not trust ${files.length === 1 ? 'it' : 'them'}`;
function cmdStatus(pos, opt, out, log) {
  // CP-03 R3-Q1-M6: with no state, or a state that fails its digest, every published file on disk is
  // UNBOUND. Report them and exit 1 (never 2, which reads as "nothing to check").
  let loaded;
  try { loaded = loadState(opt); } catch (e) {
    const dir = opt.ledger ? dirname(statePath(resolve(opt.ledger))) : resolve('audit');
    const files = e instanceof Refusal ? publishedOnDisk(dir) : [];
    if (files.length) {
      log(`${unboundMsg(files, e.message.split(';')[0])}. Re-audit with \`start <claims.md> --restart --quarantine-published\``);
      if (opt.json) out(JSON.stringify({ state: null, error: e.message, published_unbound: files }, null, 2));
      throw new Refusal(e.message, 1);
    }
    throw e;
  }
  const { st } = loaded;
  const changed = st.state === 'LEDGER_READY' ? null : ledgerChanged(st); // PUBLISHABLE too: the SAFE.md is stale
  const tamper = publishedTampered(st);
  const unbound = unboundPublished(auditDir(st), recordedHashes(st).all).filter((f) => !tamper.some((t) => t.file === f));
  const bad = changed || tamper.length || unbound.length;
  if (opt.json) { out(JSON.stringify({ ...st, ...(changed ? { ledger_changed: changed } : {}), ...(tamper.length ? { published_tampered: tamper } : {}), ...(unbound.length ? { published_unbound: unbound } : {}) }, null, 2)); return bad ? 1 : 0; }
  if (changed) log(`LEDGER_CHANGED: ${changed}; this chain no longer covers the ledger. Re-audit with \`start <claims.md> --restart\``);
  for (const t of tamper) log(`PUBLISHED_TAMPERED: audit/${t.file} ${t.why}; do not trust the published files. Re-audit with \`start <claims.md> --restart\``);
  if (unbound.length) log(`${unboundMsg(unbound, 'this chain never recorded them')}. Re-audit with \`start <claims.md> --restart --quarantine-published\``);
  out(`state ${st.state}${st.aborted && st.state === 'LEDGER_READY' ? ` (rolled back after ABORTED from ${st.aborted.from})` : ''}`);
  out(`ledger ${st.ledger} (${st.rows.length} rows); author ${st.author_model}; auditor ${st.auditor_model}; ombudsman ${st.ombudsman_model}`);
  out(`tier enum: ${st.tier_check === 'doc-it' ? 'checked by doc-it' : '[skip] doc-it not installed: tier enum'}`);
  out(`verdicts ${Object.keys(st.audit.verdicts).length}/${st.rows.length}; rulings ${Object.keys(st.rulings).length}/${st.rows.length}`);
  if (st.pending) out(`PENDING ${JSON.stringify(st.pending)}`);
  if (st.published) out(`published ${st.published.at}: SAFE ${st.published.safe.length}, DO-NOT-PUBLISH ${st.published.do_not_publish.length}${tamper.length ? `; PUBLISHED_TAMPERED: ${tamper.map((t) => t.file).join(', ')}` : (unbound.length ? `; PUBLISHED_UNBOUND: ${unbound.join(', ')}` : '; files match their hashes')}`);
  return st.state === 'ESCALATED_TO_OWNER' ? 3 : (bad ? 1 : 0);
}

export function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(s + '\n'), log = (s) => process.stderr.write(s + '\n')) {
  const [cmd, ...rest] = argv;
  const cmds = { start: cmdStart, 'record-audit': cmdRecordAudit, 'record-ombudsman': cmdRecordOmbudsman, abort: cmdAbort, status: cmdStatus };
  if (!cmds[cmd]) { log('usage: audit-chain.mjs start|record-audit <file>|record-ombudsman <file>|abort|status [--ledger <claims.md>]'); return 2; }
  try {
    const { pos, opt } = parseArgs(rest);
    return cmds[cmd](pos, opt, out, log);
  } catch (e) {
    if (e instanceof Refusal) { log(`refused: ${e.message}`); return e.code; }
    throw e;
  }
}

const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) process.exit(main());
