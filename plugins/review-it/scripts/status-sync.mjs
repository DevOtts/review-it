#!/usr/bin/env node
// status-sync: after a review-it report is written, push each task verdict to status.json
// through the shared writer (build-it status-write.mjs). It never edits status.json itself.
//
// usage: status-sync.mjs --report P --impl NAME [--repo DIR] [--writer PATH]
//
// The report carries one "Task results" block per task (see references/report-format.md 2c):
//   task: T-01
//   verdict: PASS | FAIL
//   note: <reason, needed for FAIL>
// PASS -> a per-task verdict file is cut next to the report's implementation and the writer is called
//         with --status verified --by review-it. FAIL -> --status in-progress --note.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

export function parseTaskBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = line.match(/^task\s*:\s*(\S+)$/i);
    if (m) { cur = { task: m[1], verdict: null, note: '' }; blocks.push(cur); continue; }
    if (!cur) continue;
    m = line.match(/^verdict\s*:\s*(\S+)/i);
    if (m && cur.verdict === null) { cur.verdict = m[1].replace(/[`*.,;]+$/g, '').toUpperCase(); continue; }
    m = line.match(/^note\s*:\s*(.+)$/i);
    if (m) cur.note = m[1];
  }
  return blocks;
}

function findWriter(explicit) {
  const cands = [explicit, process.env.STATUS_WRITE,
    join(homedir(), 'Workspace/Devotts/build-it/plugins/build-it/scripts/status/status-write.mjs')].filter(Boolean);
  return cands.find((p) => existsSync(p));
}

function main() {
  const report = arg('report'), impl = arg('impl');
  const repo = resolve(arg('repo') || process.cwd());
  if (!report || !impl) { console.error('usage: status-sync.mjs --report P --impl NAME [--repo DIR] [--writer PATH]'); process.exit(2); }
  const writer = findWriter(arg('writer'));
  if (!writer) { console.error('status-write.mjs not found (pass --writer or set STATUS_WRITE)'); process.exit(2); }
  const reportAbs = resolve(repo, report);
  const blocks = parseTaskBlocks(readFileSync(reportAbs, 'utf8'));
  if (!blocks.length) { console.error(`refused: ${report} has no "task: <ID>" result block, nothing to write`); process.exit(1); }

  const run = (args) => spawnSync('node', [writer, ...args, '--by', 'review-it', '--impl', impl], { cwd: repo, encoding: 'utf8' });
  const reportRel = relative(repo, reportAbs);
  let failed = 0;
  for (const b of blocks) {
    let r;
    if (b.verdict === 'PASS' || b.verdict === 'VERIFIED') {
      const vdir = join(dirname(reportAbs));
      mkdirSync(vdir, { recursive: true });
      const vfile = join(vdir, `verdict-${b.task}.md`);
      writeFileSync(vfile, `# review-it verdict\n\ntask: ${b.task}\nverdict: PASS\nreport: ${reportRel}\n`);
      r = run(['set', b.task, '--status', 'verified', '--evidence', relative(repo, vfile)]);
    } else {
      r = run(['set', b.task, '--status', 'in-progress', '--note', b.note || `review-it: ${b.task} not verified (${b.verdict || 'no verdict'})`]);
    }
    process.stdout.write(`${b.task}: ${r.status === 0 ? 'ok' : 'REFUSED'} ${r.stdout}${r.stderr}`);
    if (r.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
