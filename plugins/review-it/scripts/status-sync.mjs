#!/usr/bin/env node
// status-sync: after a review-it report is written, push each task verdict to status.json
// through the shared writer (build-it status-write.mjs). It never edits status.json itself.
//
// usage: status-sync.mjs --report P --impl NAME [--repo DIR] [--writer PATH]
//
// The report carries an overall verdict in its header (references/report-format.md 2b/2c), before
// the first task block, and one "Task results" block per task (2c):
//   verdict: PASS | FAIL          <- overall, exactly once, before the first task: line
//   ...
//   task: T-01
//   verdict: PASS | FAIL
//   note: <reason, needed for FAIL>
// Only lines outside fenced code blocks (``` and ~~~), indented code and HTML comments count.
// A task is synced as verified only when the overall verdict is PASS and its own block says PASS:
// a one-task verdict file (with the report path and sha256) is cut beside the report and the writer
// is called with --status verified --by review-it. A task whose block says FAIL (or has no verdict)
// goes to in-progress with a note. With an overall FAIL or no overall verdict nothing is verified;
// PASS tasks are left as they are. Any ambiguity (duplicate task block, two verdicts in one block,
// two overall verdicts, an unknown verdict value, a stray verdict line, a task not on the board)
// is refused with exit 1 before anything is written.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// The lines a reader sees as report prose: fenced code, indented code and HTML comments are dropped
// (replaced by '' so blank-line boundaries survive).
export function proseLines(text) {
  const out = [];
  let fence = null, comment = false;
  for (const raw of text.split(/\r?\n/)) {
    if (fence) {
      const close = raw.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      out.push('');
      continue;
    }
    if (comment) { if (raw.includes('-->')) comment = false; out.push(''); continue; }
    const open = raw.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fence = open[1]; out.push(''); continue; }
    if (/^\s*<!--/.test(raw)) { if (!raw.includes('-->')) comment = true; out.push(''); continue; }
    if (/^( {4,}|\t)/.test(raw)) { out.push(''); continue; }
    out.push(raw.trim());
  }
  return out;
}

const VERDICT_LINE = /^verdict\s*:\s*(.*)$/i;
const TASK_LINE = /^task\s*:\s*(.*)$/i;
const cleanVerdict = (v) => v.trim().replace(/^[`*]+|[`*.,;]+$/g, '').toUpperCase();

// Returns { overall, blocks: [{task, verdict, note}], errors: [..] }. Any error means: write nothing.
export function parseReport(text) {
  const errors = [], blocks = [], overall = [];
  let cur = null;
  for (const line of proseLines(text)) {
    if (line === '') { cur = null; continue; }
    let m = line.match(TASK_LINE);
    if (m) {
      const id = m[1].trim();
      if (!/^\S+$/.test(id)) { errors.push(`malformed task line: "${line}"`); cur = null; continue; }
      cur = { task: id, verdicts: [], note: '' };
      blocks.push(cur);
      continue;
    }
    m = line.match(VERDICT_LINE);
    if (m) {
      if (cur) cur.verdicts.push(cleanVerdict(m[1]));
      else if (!blocks.length) overall.push(cleanVerdict(m[1]));
      else errors.push(`verdict line outside any task block after the first task: "${line}"`);
      continue;
    }
    m = line.match(/^note\s*:\s*(.+)$/i);
    if (m && cur) cur.note = m[1];
  }
  if (overall.length > 1) errors.push(`${overall.length} overall verdict lines (${overall.join(', ')}); expected exactly one`);
  for (const v of overall) if (!/^(PASS|FAIL)$/.test(v)) errors.push(`overall verdict "${v}" is not PASS or FAIL`);
  const seen = new Map();
  for (const b of blocks) {
    seen.set(b.task, (seen.get(b.task) || 0) + 1);
    if (b.verdicts.length > 1) errors.push(`task ${b.task} has ${b.verdicts.length} verdict lines (${b.verdicts.join(', ')})`);
    for (const v of b.verdicts) if (!/^(PASS|FAIL)$/.test(v)) errors.push(`task ${b.task} verdict "${v}" is not PASS or FAIL`);
  }
  for (const [t, n] of seen) if (n > 1) errors.push(`task ${t} has ${n} result blocks`);
  return {
    overall: overall.length === 1 ? overall[0] : null,
    blocks: blocks.map((b) => ({ task: b.task, verdict: b.verdicts[0] || null, note: b.note })),
    errors,
  };
}

function findWriter(explicit) {
  const cands = [explicit, process.env.STATUS_WRITE,
    join(homedir(), 'Workspace/Devotts/build-it/plugins/build-it/scripts/status/status-write.mjs')].filter(Boolean);
  return cands.find((p) => existsSync(p));
}

// Same resolution as the writer's --impl (plural folder first, then singular). Read-only.
function boardTasks(repo, impl) {
  const f = [`docs/implementations/${impl}/status.json`, `docs/implementation/${impl}/status.json`]
    .map((p) => join(repo, p)).find((p) => existsSync(p));
  if (!f) return null;
  const s = JSON.parse(readFileSync(f, 'utf8'));
  return new Set((s.waves || []).flatMap((w) => w.tasks || []).map((t) => t.id));
}

function refuse(msg) { console.error(`refused: ${msg}; nothing written`); process.exit(1); }

function main() {
  const report = arg('report'), impl = arg('impl');
  const repo = resolve(arg('repo') || process.cwd());
  if (!report || !impl) { console.error('usage: status-sync.mjs --report P --impl NAME [--repo DIR] [--writer PATH]'); process.exit(2); }
  const writer = findWriter(arg('writer'));
  if (!writer) { console.error('status-write.mjs not found (pass --writer or set STATUS_WRITE)'); process.exit(2); }
  const reportAbs = resolve(repo, report);
  const raw = readFileSync(reportAbs);
  const { overall, blocks, errors } = parseReport(raw.toString('utf8'));
  if (!blocks.length) { console.error(`refused: ${report} has no "task: <ID>" result block, nothing to write`); process.exit(1); }
  if (errors.length) refuse(`${report} is ambiguous:\n  ${errors.join('\n  ')}`);
  const known = boardTasks(repo, impl);
  if (!known) refuse(`no status.json for implementation ${impl}`);
  const missing = blocks.filter((b) => !known.has(b.task)).map((b) => b.task);
  if (missing.length) refuse(`task(s) not on the board: ${missing.join(', ')}`);

  const sha = createHash('sha256').update(raw).digest('hex');
  const reportRel = relative(repo, reportAbs);
  if (overall !== 'PASS') console.error(`review-it: overall verdict ${overall || 'missing'} in ${reportRel}: no task is verified`);
  const run = (args) => spawnSync('node', [writer, ...args, '--by', 'review-it', '--impl', impl], { cwd: repo, encoding: 'utf8' });
  let failed = 0;
  for (const b of blocks) {
    let r;
    if (b.verdict === 'PASS' && overall === 'PASS') {
      const vdir = dirname(reportAbs);
      mkdirSync(vdir, { recursive: true });
      const vfile = join(vdir, `verdict-${b.task}.md`);
      writeFileSync(vfile, `# review-it verdict\n\ntask: ${b.task}\nverdict: PASS\nreport: ${reportRel}\nreport_sha256: ${sha}\nreport_overall: PASS\n`);
      r = run(['set', b.task, '--status', 'verified', '--evidence', relative(repo, vfile)]);
      if (r.status !== 0) rmSync(vfile, { force: true });
    } else if (b.verdict === 'PASS') {
      process.stdout.write(`${b.task}: held (task PASS, overall ${overall || 'missing'}), status unchanged\n`);
      continue;
    } else {
      r = run(['set', b.task, '--status', 'in-progress', '--note', b.note || `review-it: ${b.task} not verified (${b.verdict || 'no verdict'})`]);
    }
    process.stdout.write(`${b.task}: ${r.status === 0 ? 'ok' : 'REFUSED'} ${r.stdout}${r.stderr}`);
    if (r.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}

// Compare real paths so a symlinked install, /tmp -> /private/tmp or a path with spaces still runs.
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) main();
