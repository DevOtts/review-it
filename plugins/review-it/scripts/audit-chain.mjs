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
//   record-audit <file> [--model M] [--tokens N] [--ledger <claims.md>]
//   record-ombudsman <file> [--model O] [--tokens N] [--ledger <claims.md>]
//   abort [--reason TEXT] [--ledger <claims.md>]
//   status [--json] [--ledger <claims.md>]
//
// Without --ledger the state file is found at ./audit/chain-state.json.
// Exit: 0 ok · 1 refused (nothing changed) · 2 usage/config error · 3 ESCALATED_TO_OWNER.
// Zero dependencies, Node >= 18.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'review-it/audit-chain/1';
export const VERDICTS = ['TRUE', 'FALSE', 'PARTIAL', 'UNVERIFIABLE'];
// Diagram names of CONTRACT §3.2 are canonical; the table spells two of them differently.
export const STATE_ALIASES = { AUDIT_RETRY: 'AUDIT_RETRY_FAILED', REAUDIT_SAMPLE: 'PARTIAL_TRUST' };
const IN_FLIGHT = new Set(['AUDITING', 'AUDIT_RETRY_FAILED', 'AUDITED', 'ADJUDICATING', 'PARTIAL_TRUST', 'ADJUDICATED']);
const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'gpt', 'gemini', 'llama', 'mistral', 'grok', 'deepseek', 'qwen', 'codex'];
const CMD_WORDS = /^(git|node|npm|npx|gh|grep|rg|ls|cat|find|curl|jq|sed|awk|head|tail|wc|diff|stat|bash|sh|python3?|test|doc-it|gate-check)\b/;

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
      if (k === 'json') { opt.json = true; continue; }
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

// Model identity for G-6. A bare family alias ("opus") or a full id ("claude-opus-5-5") is reduced
// to its family when one is recognisable, so two versions of one family count as the same model:
// the auditor exists to be independent of the author, and a sibling version is not.
export function modelKey(m) {
  const s = String(m || '').trim().toLowerCase();
  if (!s) return '';
  const fam = FAMILIES.find((f) => new RegExp(`(^|[^a-z])${f}([^a-z]|$)`).test(s));
  return fam || s.replace(/^claude-/, '');
}
export const sameModel = (a, b) => modelKey(a) !== '' && modelKey(a) === modelKey(b);
export const modelSlug = (m) => String(m).trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');

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
  return { rows, author };
}

// Evidence must cite repo@sha or a command (T-Q1-01). A backticked path alone is not a command.
export function evidenceOk(ev) {
  const s = String(ev || '');
  if (/[A-Za-z0-9._/-]+@[0-9a-f]{7,40}\b/.test(s)) return true;
  for (const m of s.matchAll(/`([^`]+)`/g)) if (CMD_WORDS.test(m[1].trim())) return true;
  return false;
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
function resolveTiers(rows, log) {
  const cli = findDocIt();
  if (!cli) { log('[skip] doc-it not installed: tier enum'); return { check: 'skipped', bad: [] }; }
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
function loadState(opt) {
  const f = opt.ledger ? statePath(resolve(opt.ledger)) : resolve('audit/chain-state.json');
  if (!existsSync(f)) throw new Refusal(`no audit chain state at ${f} (run start first, or pass --ledger)`, 2);
  let st; try { st = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new Refusal(`chain state unreadable: ${f}: ${e.message}`, 2); }
  if (st.schema !== SCHEMA) throw new Refusal(`chain state ${f} has schema ${st.schema}, expected ${SCHEMA}`, 2);
  return { st, file: f };
}
const saveState = (file, st) => writeAtomic(file, JSON.stringify(st, null, 2) + '\n');
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
  st.published = { at: now(), files: [`audit-${slug}.md`, 'ombudsman.md', 'SAFE.md'], safe: safe.map((x) => x.r.id), do_not_publish: dnp.map((x) => x.r.id) };
  log(`published audit/audit-${slug}.md, audit/ombudsman.md, audit/SAFE.md — SAFE ${safe.length}, DO-NOT-PUBLISH ${dnp.length}`);
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
  const { rows, author } = parseLedger(text);
  if (!rows.length) throw new Refusal(`${ledgerArg}: no ledger table with ID | Claim | Tier | Source columns`);
  const dup = rows.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) throw new Refusal(`${ledgerArg}: duplicate row id(s) ${[...new Set(dup)].join(', ')}`);

  if (author && opt['author-model'] && modelKey(author) !== modelKey(opt['author-model']))
    throw new Refusal(`author model conflict: ledger header says ${author}, --author-model says ${opt['author-model']}`);
  const authorModel = opt['author-model'] || author;
  if (!authorModel) throw new Refusal('author model unknown: add "Author model: <model>" to the ledger header or pass --author-model (G-6 cannot be checked without it)');
  const auditorModel = opt['auditor-model'];
  if (!auditorModel) throw new Refusal('--auditor-model is required (the auditor must be a different model from the author, G-6)', 2);
  if (sameModel(authorModel, auditorModel))
    throw new Refusal(`G-6: auditor model ${auditorModel} is the author's model (${authorModel}); refused before dispatch, nothing written`);
  const ombudsmanModel = opt['ombudsman-model'] || 'opus';

  const sf = statePath(ledger);
  let prev = null;
  if (existsSync(sf)) {
    try { prev = JSON.parse(readFileSync(sf, 'utf8')); } catch { prev = null; }
    if (prev && (IN_FLIGHT.has(prev.state) || prev.state === 'ESCALATED_TO_OWNER'))
      throw new Refusal(`a chain is ${prev.state} for this ledger; finish it or run abort first`);
  }

  const tiers = resolveTiers(rows, log);
  if (tiers.bad.length) throw new Refusal(`tier refused (doc-it enum, K2-02):\n  ${tiers.bad.join('\n  ')}`);

  const st = {
    schema: SCHEMA, ledger, ledger_sha256: sha256(text), stakes,
    author_model: authorModel, auditor_model: auditorModel, ombudsman_model: ombudsmanModel,
    tier_check: tiers.check,
    rows: rows.map(({ id, claim, tier, source, tier_ids }) => ({ id, claim, tier, source, tier_ids: tier_ids || null })),
    state: 'LEDGER_READY',
    audit: { round: 'initial', attempt: 1, requested: rows.map((r) => r.id), verdicts: {}, files: [] },
    recheck: { classes: [], rows: [] },
    rulings: {}, ombudsman: { round: 0, files: [], requested: [] },
    tokens: { auditor: [], ombudsman: [] },
    dispatches: [], pending: null, published: false,
    history: [...((prev && prev.history) || []), { from: prev ? prev.state : null, to: 'LEDGER_READY', event: 'ledger read', at: now(), rows: rows.length }],
  };
  rmSync(join(dirname(sf), '.work'), { recursive: true, force: true });
  const req = dispatch(st, 'auditor', st.audit.requested, 'audit every row from primary sources');
  move(st, 'AUDITING', 'dispatch auditor');
  saveState(sf, st);
  log(`ledger ${rows.length} rows; author ${authorModel}; auditor ${auditorModel}; ombudsman ${ombudsmanModel}; state AUDITING`);
  emit(req, out);
  return 0;
}

function cmdRecordAudit(pos, opt, out, log) {
  const { st, file } = loadState(opt);
  if (!['AUDITING', 'PARTIAL_TRUST'].includes(st.state)) throw new Refusal(`record-audit is not valid in state ${st.state}`);
  const vf = pos[0] ? resolve(pos[0]) : null;
  const text = vf && existsSync(vf) ? readFileSync(vf, 'utf8') : null;
  const parsed = text ? parseAuditFile(text) : { rows: [], model: null, tokens: null };
  if (text) {
    const declared = opt.model || parsed.model;
    if (!declared) throw new Refusal(`${pos[0]}: no "model:" line and no --model; cannot tell who wrote the verdicts`);
    if (sameModel(declared, st.author_model)) throw new Refusal(`G-6: verdict file is from ${declared}, the author's model (${st.author_model}); not recorded`);
    if (!sameModel(declared, st.auditor_model)) throw new Refusal(`verdict file is from ${declared}, but the dispatched auditor is ${st.auditor_model}`);
  }
  st.tokens.auditor.push(text ? tokensOf(opt, parsed) : null);
  st.audit.files.push({ file: vf, at: now(), present: !!text });

  const requested = st.audit.requested;
  const byId = new Map();
  for (const r of parsed.rows) if (!byId.has(r.id)) byId.set(r.id, r);
  const uncovered = [];
  for (const id of requested) {
    const r = byId.get(id);
    if (!r) { uncovered.push(`${id} (no row)`); continue; }
    if (!r.verdict) { uncovered.push(`${id} (verdict "${r.raw}" not one of ${VERDICTS.join('|')})`); continue; }
    if (!evidenceOk(r.evidence)) { uncovered.push(`${id} (evidence cites no repo@sha and no command)`); continue; }
  }
  const unknown = parsed.rows.filter((r) => !st.rows.some((x) => x.id === r.id)).map((r) => r.id);
  if (unknown.length) log(`note: verdict rows not in the ledger ignored: ${unknown.join(', ')}`);
  // Keep every valid requested verdict, even on a miss, so the retry asks only for what is missing.
  const round = st.state === 'PARTIAL_TRUST' ? 'recheck' : (st.audit.attempt > 1 ? 'retry' : 'initial');
  for (const id of requested) {
    const r = byId.get(id);
    if (r && r.verdict && evidenceOk(r.evidence)) st.audit.verdicts[id] = { verdict: r.verdict, evidence: r.evidence, round };
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
  if (st.state !== 'ADJUDICATING') throw new Refusal(`record-ombudsman is not valid in state ${st.state}`);
  const of = pos[0] ? resolve(pos[0]) : null;
  if (!of || !existsSync(of)) throw new Refusal(`rulings file not found: ${pos[0] || '(none)'}; state stays ADJUDICATING`);
  const parsed = parseOmbudsmanFile(readFileSync(of, 'utf8'));
  const declared = opt.model || parsed.model;
  if (!declared) throw new Refusal(`${pos[0]}: no "model:" line and no --model`);
  if (!sameModel(declared, st.ombudsman_model)) throw new Refusal(`rulings are from ${declared}, but the ombudsman is ${st.ombudsman_model} (D6)`);
  const byId = new Map(parsed.rows.map((r) => [r.id, r]));
  const bad = st.ombudsman.requested.filter((id) => { const r = byId.get(id); return !r || !r.ruling; });
  if (bad.length) throw new Refusal(`rulings missing or unreadable for ${bad.join(', ')} (ruling must be UPHELD or ${VERDICTS.join('|')}); state stays ADJUDICATING, re-dispatch the ombudsman`);
  st.tokens.ombudsman.push(tokensOf(opt, parsed));
  st.ombudsman.round += 1;
  st.ombudsman.files.push({ file: of, at: now() });

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
  rmSync(join(auditDir(st), '.work'), { recursive: true, force: true });
  st.pending = null;
  st.aborted = { at: now(), from, reason: opt.reason || null };
  move(st, 'LEDGER_READY', 'rollback: keep last published version');
  saveState(file, st);
  const kept = existsSync(join(auditDir(st), 'SAFE.md')) ? 'the last published SAFE.md is kept unchanged' : 'no SAFE.md was ever published';
  log(`ABORTED from ${from}; rolled back to LEDGER_READY; ${kept}`);
  out('state ABORTED → LEDGER_READY');
  return 0;
}

function cmdStatus(pos, opt, out) {
  const { st } = loadState(opt);
  if (opt.json) { out(JSON.stringify(st, null, 2)); return 0; }
  out(`state ${st.state}${st.aborted && st.state === 'LEDGER_READY' ? ` (rolled back after ABORTED from ${st.aborted.from})` : ''}`);
  out(`ledger ${st.ledger} (${st.rows.length} rows); author ${st.author_model}; auditor ${st.auditor_model}; ombudsman ${st.ombudsman_model}`);
  out(`tier enum: ${st.tier_check === 'doc-it' ? 'checked by doc-it' : '[skip] doc-it not installed: tier enum'}`);
  out(`verdicts ${Object.keys(st.audit.verdicts).length}/${st.rows.length}; rulings ${Object.keys(st.rulings).length}/${st.rows.length}`);
  if (st.pending) out(`PENDING ${JSON.stringify(st.pending)}`);
  if (st.published) out(`published ${st.published.at}: SAFE ${st.published.safe.length}, DO-NOT-PUBLISH ${st.published.do_not_publish.length}`);
  return st.state === 'ESCALATED_TO_OWNER' ? 3 : 0;
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
