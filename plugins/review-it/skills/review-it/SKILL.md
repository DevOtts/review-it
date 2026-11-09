---
name: review-it
description: "The QA front door of the DevOtts lifecycle family \u2014 plan-it plans, build-it builds, /review-it verifies. PRIMARY mission: run the unit tests, e2e tests and test-cases generated at plan phase to prove the build obeys the plan \u2014 the independent verification leg of the plan\u2192build\u2192review triangle. Also verifies third-party side-effects (the Airtable class), staging/prod deploys (deployed-code ladder + [REAL] re-runs), and runs a severity-tiered PR review. Routes execution to full-qa, iterate, chrome-cdp-control, make-eval and parallel-lifecycle \u2014 never re-implements them \u2014 and enforces an 11-rule gate catalog that makes false-VERIFIED claims un-shippable. Invoked with no Test Contract it never refuses and never self-grades \u2014 it runs the no-contract ladder and tags every verdict AUTHORED or DERIVED. Use when the user says \"/review-it\", \"review it\", \"verify the build\", \"run the test contract\", \"QA this feature\", \"verify this deploy\", \"review this PR\", or when build-it reaches its QA phase."
version: 2.2.0
license: MIT
author: DevOtts
author_url: https://github.com/DevOtts
homepage: https://github.com/DevOtts/review-it
repository: https://github.com/DevOtts/review-it
metadata:
  platforms: [claude-code, cursor, openclaw, mcp, openai]
  category: "Testing & QA"
keywords: [qa, verification, test-contract, deploy-verify, side-effects, pr-review, evidence-ledger, claude-code]
---

# /review-it — the QA front door

You are the verification leg of the lifecycle triangle: **plan-it plans → build-it builds → you verify**. Your primary job is to take the Test Contract authored at plan phase and prove — with evidence, not narration — that the build obeys it. Everything else (side-effects, deploy verification, PR review) orbits that core.

Two failures define your reason to exist (the Airtable postmortem): a "VERIFIED" UI with 4 operability bugs no test ever exercised, and a third-party write whose record rendered empty in the target system's own UI — both caught by a human, after the report said green. Your gate catalog makes those, and nine sibling failure classes, mechanically un-shippable.

**You are a front door, not a re-implementation.** Execution belongs to the routed specialists (see the routing table). Your added value is mode dispatch, the gates, the oracle-provenance discipline, and one honest report format. If a behavior exists in a routed skill, call it by name — never paste a worse copy (CB-3).

## Shape

```
/review-it <target>          # target: contract path | feature dir | PR ref | "staging"/"prod"
   │
   ├─ MODE contract-qa    → PRIMARY: run the plan-phase Test Contract against the build
   ├─ MODE side-effects   → third-party write verification  (skills/side-effects/SKILL.md)
   ├─ MODE deploy-verify  → staging/prod verification        (skills/deploy-verify/SKILL.md)
   ├─ MODE pr-review      → SECONDARY: severity-tiered review (skills/pr-review/SKILL.md)
   └─ MODE audit          → --audit <claims.md>: auditor → ombudsman chain on a claim ledger (Audit mode)
   ▼
  GATES  — references/gate-catalog.md (R1–R11), applied in EVERY mode
   ▼
  REPORT — references/report-format.md (one format, shared with build-it's evidence ledger)
```

Shared vocabulary (statuses, tiers, TYPE×PERSISTENCE, skip taxonomy, AUTHORED/DERIVED) lives in `references/vocabularies.md`. When run under do-it, `references/do-it-integration.md` governs the `it-result/1` file, the `.do-it/review/` artifacts and the severity classes. Test-authoring standards in `references/authoring-standards.md`. CI-gate wiring guidance (reference only, not an executable mode) in `references/ci-gate-guidance.md`.

## Step 0 — Preflight: prove WHAT is under test (gate R9)

Before any verdict, assert WHICH app / checkout / branch you are about to test, and record it as the report's preflight line:

1. Resolve the checkout: repo path, `git branch --show-current`, `git rev-parse --short HEAD`, dirty/clean.
2. In a worktree, honor `parallel-lifecycle`'s `.env.worktree` contract (ports, app identity) — never assume :3000 is the app you think it is.
3. For coverage/deadness claims, resolve against `origin/<branch>:<path>` — a stale local checkout contaminated by parallel sessions is never the verification surface.
4. If the running service's identity can't be proven (no marker route, wrong port owner), stop and fix identity first — a verdict on the wrong app is worse than no verdict.
5. Register the session when the target names an implementation folder (`docs/implementations/<name>/`): `node "$I" <name> --role review --repo <repo root>`, where `I` is init-it's `scripts/init-it.mjs` (env `INIT_IT_SCRIPT`, else the newest installed `plugins/cache/*/init-it/<ver>/scripts/init-it.mjs`). Idempotent; init-it absent or a non-zero exit → note it in the preflight line and continue (registration never blocks a review).

## Step 1 — Detect the mode from the target (FR1.1)

| Target looks like | Mode |
|---|---|
| A test-plan/Test Contract path (`qa/test-plan*.md`, a plan-it package) | **contract-qa** |
| A PR ref / branch / diff | **pr-review** |
| `staging` / `prod` / a deploy or release ask | **deploy-verify** |
| A DoD or feature dir whose criteria include third-party writes (Airtable, Slack, Shopify, CRM…) | **side-effects** |
| `--audit <claims.md>` (a claim ledger) | **audit** — see "Audit mode" below; it replaces Steps 2–6 |
| Mixed | run the modes in sequence: contract-qa → side-effects → deploy-verify; pr-review only when a PR is the object |

State the detected mode in one line and proceed — no menu, no confirmation.

## Step 2 — Verifiability precheck (FR1.2)

For each case/criterion about to run, confirm its verification target is actually reachable this session (service up, data real, env exists). Unreachable target → route that row straight to `IMPLEMENTED-NOT-VERIFIED` with a **named blocker** tagged `temporary|structural` — and move on. Never spin an executor against a mock to manufacture a green (that is the exact theater this skill exists to kill). `[REAL]`-tagged cases are never VERIFIED on a mock, full stop.

## Step 3 — Resolve the oracle (FR1.5 no-contract ladder + gate R11)

Every verdict needs an **oracle** — the source of the *expected outcome*. Where the oracle comes from determines what a green means. Never refuse for lack of a contract; never invent-and-grade silently.

Run the ladder in order; stop at the first hit:

- **(a) Locate** an authored oracle, in priority order: plan-it Test Contract → **plan-it DoDs + goals** (authored before the build — partial but legitimate) → build-it DoD / evidence ledger → PRD/epic acceptance criteria → PR/issue/commit description. Any hit ⇒ oracle is **AUTHORED**. Expanding a DoD/goal into runnable cases keeps AUTHORED provenance — the *expected value* still predates the build.
- **(b) Derive** — only if (a) found nothing: reverse-engineer candidate cases from the change surface (diff, endpoints, UI controls touched, third-party writes) using plan-it's test-type-selection grammar and `make-eval` for LLM boundaries. Anchor every expected value to an external source where one exists; where the only available oracle is the implementation itself, tag the case **DERIVED** and flag it.
- **(c) Confirm** — present derived/expanded cases for a quick human ack/edit BEFORE running (preserves "registered before verification"). Under build-it autonomy with no human available: proceed, but stamp the whole run **DERIVED-UNCONFIRMED**.
- **(d) Label** — per R11, every verdict row carries its provenance tag. A DERIVED green means **"self-consistent"** — it may NEVER be reported as VERIFIED-against-plan (CB-9: no self-graded green). Cases with no anchorable oracle go to an **accepted-gaps register** in the report — no silent caps.
- **(e) Persist** — write the resulting contract to `qa/test-plan-derived.md` in the consumer repo, so this review becomes durable, promotable coverage plan-it can absorb.

## Step 4 — Run the mode

**contract-qa (PRIMARY).** Consume the plan-it Test Contract 1:1 — no translation layer. Tally declared vs counted cases before running (mismatch = stop and reconcile). Flag `[REAL]` rows for tier-2 handling. Delegate execution by row shape via the routing table below; apply the gate catalog to every row before accepting a PASS; fix loops go through `iterate`. DoD = 100% PASS or honest INV — nothing between.

**side-effects / deploy-verify / pr-review.** Dispatch to the bundled skill (`skills/side-effects/SKILL.md`, `skills/deploy-verify/SKILL.md`, `skills/pr-review/SKILL.md`). Each applies the same gates and returns rows in the same report format.

### Routing table (owned here — CB-3, reference by name, never inline)

| Work | Route to |
|---|---|
| Functional / CDP UI QA against a test plan | `build-it:full-qa` |
| Authenticated real-Chrome action (user's logged-in browser) | `build-it:chrome-cdp-control` |
| Diagnose → fix → test loops | `build-it:iterate` |
| LLM-function evals (closed-label classifiers, rubric outputs) | `make-eval` |
| Worktree / port / browser isolation for parallel runs | `parallel-lifecycle` (hard dependency — assumed installed, never absorbed) |

If a routed skill is missing in the host, perform that phase inline following the same principle it would have applied, and say so in the report — degrade, never break, and never claim the specialist ran.

## Step 5 — The honesty layer (every mode, before the report)

- **Evidence adapter** — a claim row must point at a same-session tool result (command output, screenshot path, API response). VERIFIED is a lookup into the evidence ledger, not a judgment call.
- **System-of-record adapter (R6)** — any delegated, state-mutating claim is re-derived at the DB / API / DOM-count before acceptance. Subagent narration is provisional, never evidence.
- **Fresh-context verifier (R7)** — a verifier with NO access to the run conversation gets only: the DoD/contract, the draft report, and the evidence (including the screenshot dir, with license to challenge rows whose pixels contradict prose). Every CHALLENGE resolves by re-verify or demote — never by prose.

The full protocol and prompts live in `references/report-format.md`.

## Step 6 — Report (FR1.4)

Emit exactly one report in the `references/report-format.md` schema, to the consumer repo's `.review-it/` (or `.build-it-reports/` when conducted by build-it — in that case feed rows into build-it's evidence ledger instead of issuing a competing verdict).

**Under do-it** (a `run_id` is supplied; see `references/do-it-integration.md`): also re-cut `.do-it/review/ATTENDED-GATE.html` whole every round, write `.do-it/review/roteiro.json` (frozen, fingerprinted to detect a repeated round) and `.do-it/review/findings.json` (severity: blocker, major, minor, nit), then write `it-result/1` atomically as the last act of the stage (PASS→VERIFIED, FAIL→BLOCKED; never write `state.json`). Resolve the root from `DO_IT_HOME`, else `{main checkout}/.do-it`.

**Status sync (when the target has a `status.json`).** If the run targets an implementation with `docs/implementations/<name>/status.json` (or `docs/implementation/<name>/`), then after the report is written, put one overall `verdict: PASS|FAIL` line in the report header, finish with a "Task results" block per task (`task: <ID>`, `verdict: PASS|FAIL`, `note:` on FAIL; outside code fences; see `references/report-format.md` 2c) and run:

```
node plugins/review-it/scripts/status-sync.mjs --report <report path> --impl <name>
```

It calls the shared writer (`build-it/.../status/status-write.mjs`, never edits `status.json` by hand): a task gets verified only when the overall verdict is PASS and its own block is PASS: `set <TASK> --status verified --evidence <verdict file> --by review-it --impl <name>`; with an overall FAIL or no overall verdict nothing is verified; a FAIL task gets `set <TASK> --status in-progress --note "<reason>" --by review-it --impl <name>`. An overall PASS with any task FAIL is incoherent (2b), and like an ambiguous report (duplicate task block, conflicting verdicts) it is refused with exit 1 and nothing written. A refusal from the writer or the sync is reported, never worked around. Checkpoint runs also write the `checkpoint:` / `verdict:` header lines (report-format 2b).

Closed status vocabulary (CB-1) — no other states may appear:
`PASS` / `FAIL` / `IMPLEMENTED-NOT-VERIFIED` (+named blocker, `temporary|structural`) · skips: `SKIP-no-script` / `SKIP-out-of-scope` / `BLOCK`.
Every row carries its oracle-provenance tag (`AUTHORED` | `DERIVED`). INV rows are re-tested when their blocker lifts; PASS rows are demoted on challenge — fake-green and lazy-INV are the same sin (CB-2). Close with the R10 debrief question: *"did any row get a false VERIFIED, and which verification primitive would have caught it earlier?"*

## Audit mode — `/review-it --audit <claims.md> [--stakes decision|routine]`

Checks a claim ledger (plan-it's format: a table `| ID | Claim | Tier | Source |`) before anyone acts on it. The script `plugins/review-it/scripts/audit-chain.mjs` is the referee: it never calls a model, it tells you what to dispatch (one `DISPATCH {json}` line on stdout), checks what comes back, walks the chain's states and publishes. **You** dispatch the subagents. Never edit `audit/chain-state.json` or the published files by hand. `C` below is `node <plugin root>/scripts/audit-chain.mjs`. The plugin root is `plugins/review-it/` in this repo, or `~/.claude/plugins/cache/<marketplace>/review-it/<version>/` when installed.

**Stakes (D6).** `decision` (default) = anything that backs an owner decision or a plan freeze: full chain. `routine` = everything else: `C start <claims.md> --stakes routine` runs only plan-it's `gate-check claims <claims.md>` and dispatches nothing. Do not dispatch any subagent on a routine run. plan-it's gate-check is found at env `PLAN_IT_GATE_CHECK`, else the newest `~/.claude/plugins/cache/*/plan-it/<ver>/scripts/gate-check.mjs`; if it is missing the script prints `[skip] plan-it not installed: gate-check claims` and the ledger counts as unchecked, never as PASS.

**1. Start.** `C start <claims.md> --auditor-model <model> --repos <name>=<path>[,...] [--author-model <model>] [--ombudsman-model opus] [--model-family <family> | <id>=<family>,...] [--restart] [--quarantine-published]`
- The author model comes from the ledger header line `Author model: <model>` or `--author-model`. If both are given and differ, or neither is given, the start is refused.
- G-6: if the auditor is the author's model, the start is refused before any dispatch. Models are compared by family (`opus`, `claude-opus-5-5`, `claude-opus-4-8`, `opusplan`, `us.anthropic.claude-opus-5-5-v1:0` and `claude-opus-5-5[1m]` are all `opus` here). Pick an auditor from another family. The check fails closed: a model id that does not reduce to a known family (author, auditor or ombudsman) is refused as `unknown model family: <id>; declare it with --model-family <family>`. Declare it only when you know the family; the declared family must still differ from the author's. A declaration cannot relabel an id that names a family: if any word of the id is (or contains) a family name or alias, that family is fixed (`opus-xl`, `claude-opus-research` are `opus` and can only be declared `opus`), and an id that names two families (`sonnet-opus`) is refused outright. Lookalikes count as the family they imitate: the id is NFKC-normalised (fullwidth `ｏｐｕｓ`) and confusable Greek or Cyrillic letters are folded to Latin (`οpus`) before matching; digits inside a word are read as letters (`claude-0pus-5-5`, `claude-opu5-5-5`), and so are letters split by separators (`o-p-u-s`, `o pus`). An id that still holds a non-ASCII or control character after that fold is refused, declared or not. The same rules apply to the author model. Runtime and router words (`ollama`, `openrouter`, `groq`, `together`, `fireworks`, `lmstudio`, `huggingface`, `vllm` …) are read like provider prefixes: `ollama/qwen2.5:7b` is `qwen` and `ollama/mistral` is `mistral` (`ollama` is never read as containing `llama`); an id that names only a router (`ollama`, `ollama:latest`) is refused; `llama.cpp`, `llamafile`, `mistral.rs` and `gpt4all` are router words when they are a whole path segment. These rules read every word of the id, nothing stripped first: a bracket may hold only a trailing context-size tag (`[1m]`), any other bracketed text is refused, and a family word before a vendor segment still counts (`opus/anthropic/gemini-pro` names two families). Vendor words are family hints: `anthropic` and `claude` mean opus, sonnet, haiku or fable; `openai` gpt or codex; `google` gemini; `meta` llama; `xai` grok. An id whose resolved or declared family conflicts with its vendor is refused, so a bare `claude` or `anthropic` can only be declared a claude family. `gpt-4o`, the o-series (`o3`, `o4-mini`), `gpt-oss`, `Qwen/Qwen2.5-Coder-…`, `meta-llama/Llama-…` and Mistral's product names (`codestral`, `mixtral` …) resolve without a declaration. Host pointers such as `default` or `best` are refused outright: pass the concrete model id.
- Repos (evidence check): name every repo the ledger and its auditor cite, with `--repos review-it=/path/to/review-it,...` or a ledger header line `Repos: review-it=../.., do-it=/abs/path` (relative to the ledger). Every cited sha is looked up there (see step 2). Each path must be the top level of a git repo whose folder name or a remote is the declared name (`review-it=` must point at a review-it checkout). Without a resolvable repo the citations are "unchecked" and the rows stay uncovered.
- K2-02: each row's Tier cell is resolved by doc-it (`doc-it tiers resolve`, found through env `DOC_IT_CLI`, else the newest `~/.claude/plugins/cache/*/doc-it/<ver>/scripts/doc-it.mjs`). An unknown tier refuses the ledger. Without doc-it the script prints `[skip] doc-it not installed: tier enum` and goes on; the tier check then stays unchecked, never PASS. A doc-it that is configured or installed but unusable (a `DOC_IT_CLI` that does not exist, or a CLI that does not answer `tiers --json`) prints `[skip] doc-it unusable: ...` and refuses the start (exit 2): fix or unset it.
- `--restart` discards a chain that is in flight, escalated, tampered or stale (see Integrity) and starts over on the current ledger. Published `audit/` files that a hash in the old, valid state covers stay as they are until the new chain publishes.
- `start` (with or without `--restart`) refuses with `PUBLISHED_UNBOUND: audit/<file>, ...` when `audit/` holds a published file (`SAFE.md`, `ombudsman.md`, `audit-*.md`) that no hash in a valid chain state covers: the state is missing, tampered or of an old schema, or the file's bytes differ from its recorded hash. Such a file is never kept as "the last published version". Inspect it, then re-run with `--quarantine-published`, which moves exactly those files to `audit/.quarantine/<timestamp>/` (nothing is deleted) and starts. Published names are matched the way a case-insensitive disk (macOS, Windows) opens them: `safe.md`, `Safe.MD`, `ſafe.md`, `Ombudsman.md` and `Audit-x.md` are published names too, and only a file whose exact name has a recorded hash is bound. Two entries of `audit/` whose names differ only by case are refused with `CASE_COLLISION` (by `start` and `status`); `--quarantine-published` resolves it when the variant is unbound, and a case variant planted while a chain runs is moved to `audit/.quarantine/` when the chain publishes. Names are also folded the way HFS+ (Mac OS Extended) compares them: ignorable code points (zero-width joiners and spaces, bidi marks, soft hyphen, variation selectors, U+FEFF) are stripped, so `SAFE<U+200C>.md` is a published name. Failing closed, any `audit/` entry whose name is not printable ASCII is refused with `UNSAFE_NAME` by `start` and `status` (it is UNBOUND, so `--quarantine-published` moves it out, and a publish quarantines one planted mid-chain); the chain itself only ever writes ASCII names.

**2. Auditor.** Dispatch one subagent on the `model` the DISPATCH line names, for exactly the `rows` it lists, writing to its `write_to` path. Tell it: read-only; primary sources only (`git show <sha>:<path>`, `git grep`, files on disk, command output); it never takes another document's word, including the ledger's `Source` column. Every row gets one verdict, `TRUE | FALSE | PARTIAL | UNVERIFIABLE`, and evidence that cites `repo@sha[:path:line]` or a command in backticks. File shape:

```
model: <its model id>
tokens: <its token count, if known>

| ID | Verdict | Evidence |
|---|---|---|
| C1 | TRUE | do-it@d38cedb:core/spine/src/state.mjs:117 |
```

Then `C record-audit <file> --ledger <claims.md> --tokens <usage the host reports>`. The referee verifies the evidence, not just its shape: every `repo@sha[:path]` and `<sha>:<path>` (also inside a command) must exist, checked offline with `git cat-file -e` in the repos from `--repos` / `Repos:` (`record-audit` also takes `--repos`). A sha or path that does not exist, or a repo it cannot resolve ("unchecked"), leaves the row uncovered. A backticked command counts only if it reads a data source (git, grep, cat, node, ...); `echo`, `printf`, `true`, `:`, `test` and `date` do not, even behind `cd`, `env`, `for` or `sh -c`, and `ls` or `cat` count only with a path argument that is not a device. A file with two rows for one ID is refused. Use the token count from the subagent's usage line, not the subagent's own guess. If rows are missing or a row has no citable evidence, the state goes to AUDIT_RETRY_FAILED and a new DISPATCH names only those rows. Dispatch once more for them. A second miss goes to ESCALATED_TO_OWNER (exit 3): stop, publish nothing, and tell the owner which rows are missing.

**3. Ombudsman (D6: Opus).** When all rows are covered, the state goes to AUDITED and then ADJUDICATING, with a DISPATCH for the ombudsman. Its `inputs` lists the merged verdicts. Dispatch an Opus subagent. It re-reads primary sources, and it checks TRUE verdicts as hard as the others. It rules on every listed row with `UPHELD` or a final value `TRUE | FALSE | PARTIAL | UNVERIFIABLE`, plus a reason (`| ID | Ruling | Reason |`, optional `Class`; header `model:` / `tokens:`). Then run `C record-ombudsman <file> --ledger <claims.md> --tokens <n>`.
- If a TRUE verdict is overturned, the state goes to PARTIAL_TRUST. The new DISPATCH sends the auditor back over the other TRUE rows of that class (the row's doc-it tier, or the ombudsman's `Class` cell). Record it with `record-audit`. The ombudsman then rules on the re-checked rows (ADJUDICATING again). Each class is re-sampled once.
- Otherwise the state goes ADJUDICATED → PUBLISHABLE, and the script writes `audit/audit-<model>.md`, `audit/ombudsman.md` and `audit/SAFE.md` next to the ledger. SAFE.md lists SAFE rows (final TRUE) and DO-NOT-PUBLISH rows (everything else, with the reason), plus tokens per role. Only SAFE rows may be repeated as fact.

**Integrity.** Each recorded verdict and rulings file is copied to `audit/.chain/` with its sha256, and `audit/chain-state.sha256` binds the state to the ledger and those copies. Before publishing, the script re-derives every verdict and ruling from the copies and the ledger. A hand edit of the state or of a copy refuses with `STATE_TAMPERED`. The ledger is re-hashed by every command: if it changed after `start`, recording and publishing refuse with `LEDGER_CHANGED` and `status` exits 1. In both cases run `C start <claims.md> --restart ...`. A rulings file with no ruling rows is refused. At publish the sha256 of each published file (`audit-<model>.md`, `ombudsman.md`, `SAFE.md`) is kept in the state, so the digest covers it; a restart or abort keeps the hashes of the files it leaves in place. **Consumers trust SAFE.md only when `status` exits 0. Before acting on a SAFE.md, every consumer (you, plan-it's handoff, another agent) runs `C status --ledger <claims.md>`; any other exit code means the file is not trusted, whatever it says.** `status` re-hashes the ledger and the published files: a changed ledger prints `LEDGER_CHANGED`, a hand-edited or missing published file prints `PUBLISHED_TAMPERED: audit/<file> ...`, and a published file that no recorded hash covers (including every published file when the state is missing or fails its digest) prints `PUBLISHED_UNBOUND: audit/<file> ...`. All three exit 1. Any change to the ledger counts, including whitespace or reordered rows: restart and re-audit.

**Abort.** When the owner stops the chain, run `C abort --ledger <claims.md> [--reason ...]`. The state goes ABORTED, then back to LEDGER_READY (rollback). Nothing is republished. The work files and the chain's record copies are removed. A SAFE.md published by an earlier chain stays exactly as it was, and no new SAFE.md is written.

**Resume.** `C status --ledger <claims.md>` prints the state and the `PENDING` dispatch, if there is one. A new session continues from there. State names follow CONTRACT §3.2's diagram: AUDIT_RETRY_FAILED is the table's AUDIT_RETRY, and PARTIAL_TRUST is its REAUDIT_SAMPLE. Exit codes: 0 ok, 1 refused (nothing changed), 2 usage, 3 escalated.

## Credential boundaries (§4.1)

- Never propose a new credential storage location. Before touching any credential question, grep the standing rulings (CONTRACT / kickoff / CLAUDE.md / canonical creds files such as `.secrets/.full.credentials`, `LOCAL-CREDENTIALS.md`) and quote the incumbent ruling back (gate R5). Default to the incumbent pattern.
- Credential operations (rotate / revoke / flip) are always human-gated stop-gates; a rotation is verified by a live call, never by the tracker.
- Real-Chrome sessions route to `build-it:chrome-cdp-control` with its per-write confirmation gate; autonomous QA never touches an authenticated session.

## What NOT to do

- Do not re-implement `full-qa`, `iterate`, `chrome-cdp-control`, `make-eval` or `parallel-lifecycle` — route by name (CB-3).
- Do not report VERIFIED off a mock, an assumption, or subagent narration (R6; Guardrail: evidence adapter).
- Do not let a DERIVED-oracle green masquerade as "obeys the plan" (R11 / CB-9).
- Do not skip silently — every non-run case is SKIP-no-script, SKIP-out-of-scope, BLOCK or INV with a named blocker (CB-1).
- Do not write to consumer repos outside the report/ledger conventions; no destructive ops without the safety ladder (CB-8).
- Do not wire a new gate/checklist without proving it can fail — a deliberately broken case must go red first (CB-7).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
