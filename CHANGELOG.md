# Changelog

All notable changes to the `review-it` plugin.

## [2.1.1] — 2026-10-18

Patch release, from the first real run of the do-it harness.

### Fixed
- `status-sync` reads the verdict value strictly: exactly `PASS` or `FAIL`. It used to upper-case the
  value and strip backticks, asterisks and trailing punctuation, so a report with `verdict: pass` or
  `verdict: **PASS**` synced a task as verified while build-it's checkpoint reader rejected the same
  file. Such a report is now refused with "is not PASS or FAIL" and nothing is written.

### Changed
- report-format §2b says what a checkpoint verdict releases: the slices that depend on the reviewed
  work and the promotion of that work, never independent work (the old text said build-it decides
  whether it may cross a boundary). It also states the reading rule: one overall `verdict:` line,
  code blocks and HTML comments ignored, and PASS together with FAIL is not a pass.
- The marketplace is named `review-it`, and the install line is `review-it@review-it`. plan-it,
  review-it, conclude-it and do-it all called theirs `devotts`, so adding two of them clashed;
  `devotts` is now only the do-it hub. Someone who added this repo as `devotts` should remove that
  entry and add `review-it`.

## [2.1.0] — 2026-10-18

Minor release. review-it can now write its per-task result into an implementation's `status.json`,
and its reports can carry the checkpoint lines build-it gates on.

### Added
- Checkpoint header (report-format §2b): a checkpoint run's report carries `checkpoint: CP-NN` and
  `verdict: PASS|FAIL`, which build-it's `checkpoints.mjs` reads. Runs that are not checkpoints
  are unchanged.
- `scripts/status-sync.mjs` (report-format §2c): after a report is written, each task's result goes
  to `status.json` through build-it's `status-write`. A task verified after the honesty adapters is
  set `verified` with a per-task verdict file that records the report path and its sha256; every
  other task goes back to `in-progress` with a note. Only the report's overall verdict counts, text
  inside code blocks and comments is ignored, and a report that contradicts itself (overall PASS
  with a task that is not PASS) or is ambiguous is refused with nothing written.
- Preflight step 5: when the target names an implementation folder, register the session with
  init-it (`--role review`). It never blocks a review.

### Known limits
- `status-write` cannot authenticate the caller, so a verdict written by hand can still be passed
  as review-it's. Treat `verified` as a claim, as the status output labels it.

## [2.0.0] — 2026-10-14

Major release: review-it moves to 2.0.0 together with the rest of the *-it lifecycle family (prompt-it 1.0.0, plan-it 5.0.0, build-it 4.0.0, conclude-it 2.0.0, parallel-lifecycle 1.0.0). No behaviour change beyond 1.1.0.

### Changed
- Version bump in `plugin.json`, `marketplace.json` and both `review-it` `SKILL.md` frontmatters.
- prompt-it pin 0.3.0 → 1.0.0 (exact) in `.claude-plugin/marketplace.json`.

## [1.1.0] — 2026-10-14

do-it integration (companion-change catalog, review-it section). Additive; standalone behaviour unchanged.

### Added
- `skills/references/do-it-integration.md`: owns and re-cuts `.do-it/review/ATTENDED-GATE.html` each round, `roteiro.json` with a frozen fingerprint to detect a repeated round, `findings.json`; severity classes blocker / major / minor / nit; `it-result/1` writer rules; `DO_IT_HOME` root resolution; PASS→VERIFIED, FAIL→BLOCKED mapping; T1/T2/T3 tier vocabulary.
- Step 6 of the front door points at it when run under do-it.

### Changed
- prompt-it pin 0.2.1 → 0.3.0 in `.claude-plugin/marketplace.json` (G-15 drift fix).

## [1.0.0] — 2026-07-14

First public release — the QA front door of the DevOtts lifecycle family
(plan-it plans → fable-it builds → **review-it verifies**).

### Added
- **Front door** (`skills/review-it/SKILL.md`): mode detection (contract-qa PRIMARY ·
  side-effects · deploy-verify · pr-review SECONDARY), R9 environment-identity preflight,
  verifiability precheck, the FR1.5 **no-contract ladder** (locate → derive → confirm →
  label → persist), R11 **oracle provenance** (AUTHORED vs DERIVED — no self-graded green),
  and a routing table to the existing specialists (`full-qa`, `iterate`,
  `chrome-cdp-control`, `make-eval`, `parallel-lifecycle`) — referenced by name, never
  re-implemented.
- **Gate catalog** (`skills/references/gate-catalog.md`): the 11 rules, each
  trigger → test → action — wrong-layer, operability, read-stability, first-look,
  directive-lookup, narration≠evidence, pixels-over-prose, deploy-truth,
  environment-identity, debrief-methodology, oracle-provenance.
- **Report format** (`skills/references/report-format.md`): the single source of truth
  for the evidence-ledger row schema shared with fable-it, the report skeleton, and the
  fresh-context verifier protocol.
- **Vocabularies** (`skills/references/vocabularies.md`): TYPE × PERSISTENCE two-axis
  classification, the three-tier gate model, the closed status vocabulary
  (PASS / FAIL / INV + named blocker), the skip taxonomy, and provenance tags.
- **Authoring standards** and **CI-gate guidance** references.
- **Bundled modes**: `side-effects` (third-party write verification — the Airtable class),
  `deploy-verify` (deployed-code ladder + [REAL] re-runs + release checklist →
  READY/NOT-READY), `pr-review` (severity-tiered, evidence-cited process wrapper loading
  `.claude/review-config.md`).
- Devotts-family packaging: `devotts` marketplace manifest + plugin manifest; docs;
  22-case Test Contract (`qa/test-plan-master.md`) with committed fixtures.

### Deprecated (ecosystem moves shipped with this release)
- Standalone `~/.claude/skills/full-qa` → pointer to fable-it's bundled copy.
- Engine-Core `review-pr` skill → `.claude/review-config.md` project config + pointer.
