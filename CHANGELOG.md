# Changelog

All notable changes to the `review-it` plugin.

## [Unreleased]

### Added
- Audit mode, `/review-it --audit <claims.md> [--stakes decision|routine]` (do-it 1.1 Q1, D6, G-6).
  `scripts/audit-chain.mjs` referees the chain from auditor to ombudsman, following CONTRACT §3.2: one
  re-dispatch of the missing rows, then escalation to the owner; PARTIAL_TRUST re-check of a class
  after an overturned TRUE; owner abort with rollback. State lives in `audit/chain-state.json`. It
  publishes `audit/audit-<model>.md`, `audit/ombudsman.md` and `audit/SAFE.md` only when the chain
  completes. An auditor of the author's model is refused before dispatch. `--stakes routine` runs only
  plan-it's `gate-check claims`.
- Every ledger row's tier is resolved by `doc-it tiers resolve`, and an unknown tier is refused (K2-02).
  Without doc-it the audit prints `[skip] doc-it not installed: tier enum` and never reports that check
  as PASS (K2-03, D14).

### Security (CP-03 adversarial review)
- G-6 fails closed: a model id that does not reduce to a known family (`opusplan`, `best`) is refused
  instead of being compared as a raw string; `--model-family` declares an unknown one (Q1-H1).
- Evidence is verified, not only shaped: cited shas and paths are looked up with `git cat-file -e` in the
  repos named by `--repos` or the ledger's `Repos:` header; `echo`/`printf`/`true`/`:` are not evidence (Q1-M1).
- The chain state is bound to copies of every recorded file (`audit/.chain/`) by a digest sidecar, and
  publish re-derives every verdict and ruling from them: `STATE_TAMPERED` (Q1-M2).
- A ledger changed after `start` refuses with `LEDGER_CHANGED`; `start --restart` re-audits (Q1-M3).
- Duplicate ids in a verdict or rulings file, and an unusable doc-it (`[skip] doc-it unusable`), refuse (Q1-L3, Q1-L4).
- A model id that names a family fixes it: `--model-family` cannot relabel `opus-xl` or `claude-opus-research`,
  and an id naming two families is refused (R2-Q1-M4).
- The published files are hashed into the chain state; `status` exits 1 with `PUBLISHED_TAMPERED` after a hand
  edit of SAFE.md, ombudsman.md or the audit file. Consumers run `status` before trusting SAFE.md (R2-Q1-M5).
- `ls`/`cat` with no path or a device path are not evidence; a `--repos` path must be a repo top level whose
  folder or remote carries the declared name; an empty `Repos:` header no longer reads the next line (R2-L5, R2-L6, R2-L7).
- A published file (`SAFE.md`, `ombudsman.md`, `audit-*.md`) that no hash in a valid chain state covers is
  UNBOUND. `start` (with or without `--restart`) refuses and names it; `--quarantine-published` moves it to
  `audit/.quarantine/<timestamp>/` first. `status` exits 1 with `PUBLISHED_UNBOUND`, also when the state is
  missing or fails its digest. A forged SAFE.md can no longer survive a restart from a tampered or deleted
  state (R3-Q1-M6).
- Published names are matched case-insensitively, as macOS and Windows disks open them (`safe.md`, `ſafe.md`,
  `Ombudsman.md`, `Audit-x.md`): a case variant is UNBOUND, so `status` exits 1 and `start` refuses it. Two names
  in `audit/` that differ only by case are refused with `CASE_COLLISION`; a variant planted mid-chain is
  quarantined at publish (R4-Q1-M7).
- Ignorable code points are stripped when published names are folded, as HFS+ compares names (`SAFE<U+200C>.md`
  opened as `audit/SAFE.md` there). Any `audit/` entry whose name is not printable ASCII is refused with
  `UNSAFE_NAME` by `start` and `status`, is UNBOUND, and is quarantined by `--quarantine-published` or at publish (R5-Q1-M8).
- G-6 family rules read the whole model id: bracketed text other than a trailing `[1m]` tag is refused, a family word
  before a vendor segment still counts, and vendor words (`anthropic`, `claude`, `openai`, `google`, `meta`, `xai`) are
  family hints that a resolved or declared family must match, so `gemini-2.5-pro[opus]` and a bare `claude` declared
  `gemini` are refused (R5-Q1-M9, R5-L3). Prefix words after the head word are read as letters (`o-p-us`, `h-ai-ku`, R5-L1).
- `llama.cpp`, `llamafile`, `mistral.rs`, `gpt4all` are router words; `gpt-4o`, `o3`, `o4-mini`, `gpt-oss`, `Qwen/Qwen2.5-…`,
  `meta-llama/Llama-…` and `codestral` resolve without a declaration (R5-L2, R5-L4).
- Lookalike model ids are folded before family matching (NFKC, confusable Greek/Cyrillic letters to Latin,
  0→o, 1→l, 5→s inside a word, separated letters read joined up), so `οpus`, `ｏｐｕｓ`, `claude-0pus-5-5`,
  `o-p-u-s` are `opus` and cannot be declared another family; an id still holding non-ASCII is refused (R3-L4).
- Runtime and router words (`ollama`, `openrouter`, `groq`, `together` …) are read as provider prefixes, so
  `ollama/qwen2.5:7b`, `ollama/mistral` and `ollama/deepseek-r1` resolve to their family instead of being refused
  as "more than one family (llama, …)"; an id naming only a router is refused (R4-L8).

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
