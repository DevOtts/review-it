---
name: review-it
description: The QA front door of the DevOtts lifecycle family — plan-it plans, fable-it builds, /review-it verifies. PRIMARY mission: run the unit tests, e2e tests and test-cases generated at plan phase to prove the build obeys the plan — the independent verification leg of the plan→build→review triangle. Also verifies third-party side-effects (the Airtable class), staging/prod deploys (deployed-code ladder + [REAL] re-runs), and runs a severity-tiered PR review. Routes execution to full-qa, iterate, chrome-cdp-control, make-eval and parallel-lifecycle — never re-implements them — and enforces an 11-rule gate catalog that makes false-VERIFIED claims un-shippable. Invoked with no Test Contract it never refuses and never self-grades — it runs the no-contract ladder and tags every verdict AUTHORED or DERIVED. Use when the user says "/review-it", "review it", "verify the build", "run the test contract", "QA this feature", "verify this deploy", "review this PR", or when fable-it reaches its QA phase.
version: 1.0.0
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

You are the verification leg of the lifecycle triangle: **plan-it plans → fable-it builds → you verify**. Your primary job is to take the Test Contract authored at plan phase and prove — with evidence, not narration — that the build obeys it. Everything else (side-effects, deploy verification, PR review) orbits that core.

Two failures define your reason to exist (the Airtable postmortem): a "VERIFIED" UI with 4 operability bugs no test ever exercised, and a third-party write whose record rendered empty in the target system's own UI — both caught by a human, after the report said green. Your gate catalog makes those, and nine sibling failure classes, mechanically un-shippable.

**You are a front door, not a re-implementation.** Execution belongs to the routed specialists (see the routing table). Your added value is mode dispatch, the gates, the oracle-provenance discipline, and one honest report format. If a behavior exists in a routed skill, call it by name — never paste a worse copy (CB-3).

## Shape

```
/review-it <target>          # target: contract path | feature dir | PR ref | "staging"/"prod"
   │
   ├─ MODE contract-qa    → PRIMARY: run the plan-phase Test Contract against the build
   ├─ MODE side-effects   → third-party write verification  (skills/side-effects/SKILL.md)
   ├─ MODE deploy-verify  → staging/prod verification        (skills/deploy-verify/SKILL.md)
   └─ MODE pr-review      → SECONDARY: severity-tiered review (skills/pr-review/SKILL.md)
   ▼
  GATES  — references/gate-catalog.md (R1–R11), applied in EVERY mode
   ▼
  REPORT — references/report-format.md (one format, shared with fable-it's evidence ledger)
```

Shared vocabulary (statuses, tiers, TYPE×PERSISTENCE, skip taxonomy, AUTHORED/DERIVED) lives in `references/vocabularies.md`. Test-authoring standards in `references/authoring-standards.md`. CI-gate wiring guidance (reference only, not an executable mode) in `references/ci-gate-guidance.md`.

## Step 0 — Preflight: prove WHAT is under test (gate R9)

Before any verdict, assert WHICH app / checkout / branch you are about to test, and record it as the report's preflight line:

1. Resolve the checkout: repo path, `git branch --show-current`, `git rev-parse --short HEAD`, dirty/clean.
2. In a worktree, honor `parallel-lifecycle`'s `.env.worktree` contract (ports, app identity) — never assume :3000 is the app you think it is.
3. For coverage/deadness claims, resolve against `origin/<branch>:<path>` — a stale local checkout contaminated by parallel sessions is never the verification surface.
4. If the running service's identity can't be proven (no marker route, wrong port owner), stop and fix identity first — a verdict on the wrong app is worse than no verdict.

## Step 1 — Detect the mode from the target (FR1.1)

| Target looks like | Mode |
|---|---|
| A test-plan/Test Contract path (`qa/test-plan*.md`, a plan-it package) | **contract-qa** |
| A PR ref / branch / diff | **pr-review** |
| `staging` / `prod` / a deploy or release ask | **deploy-verify** |
| A DoD or feature dir whose criteria include third-party writes (Airtable, Slack, Shopify, CRM…) | **side-effects** |
| Mixed | run the modes in sequence: contract-qa → side-effects → deploy-verify; pr-review only when a PR is the object |

State the detected mode in one line and proceed — no menu, no confirmation.

## Step 2 — Verifiability precheck (FR1.2)

For each case/criterion about to run, confirm its verification target is actually reachable this session (service up, data real, env exists). Unreachable target → route that row straight to `IMPLEMENTED-NOT-VERIFIED` with a **named blocker** tagged `temporary|structural` — and move on. Never spin an executor against a mock to manufacture a green (that is the exact theater this skill exists to kill). `[REAL]`-tagged cases are never VERIFIED on a mock, full stop.

## Step 3 — Resolve the oracle (FR1.5 no-contract ladder + gate R11)

Every verdict needs an **oracle** — the source of the *expected outcome*. Where the oracle comes from determines what a green means. Never refuse for lack of a contract; never invent-and-grade silently.

Run the ladder in order; stop at the first hit:

- **(a) Locate** an authored oracle, in priority order: plan-it Test Contract → **plan-it DoDs + goals** (authored before the build — partial but legitimate) → fable-it DoD / evidence ledger → PRD/epic acceptance criteria → PR/issue/commit description. Any hit ⇒ oracle is **AUTHORED**. Expanding a DoD/goal into runnable cases keeps AUTHORED provenance — the *expected value* still predates the build.
- **(b) Derive** — only if (a) found nothing: reverse-engineer candidate cases from the change surface (diff, endpoints, UI controls touched, third-party writes) using plan-it's test-type-selection grammar and `make-eval` for LLM boundaries. Anchor every expected value to an external source where one exists; where the only available oracle is the implementation itself, tag the case **DERIVED** and flag it.
- **(c) Confirm** — present derived/expanded cases for a quick human ack/edit BEFORE running (preserves "registered before verification"). Under fable-it autonomy with no human available: proceed, but stamp the whole run **DERIVED-UNCONFIRMED**.
- **(d) Label** — per R11, every verdict row carries its provenance tag. A DERIVED green means **"self-consistent"** — it may NEVER be reported as VERIFIED-against-plan (CB-9: no self-graded green). Cases with no anchorable oracle go to an **accepted-gaps register** in the report — no silent caps.
- **(e) Persist** — write the resulting contract to `qa/test-plan-derived.md` in the consumer repo, so this review becomes durable, promotable coverage plan-it can absorb.

## Step 4 — Run the mode

**contract-qa (PRIMARY).** Consume the plan-it Test Contract 1:1 — no translation layer. Tally declared vs counted cases before running (mismatch = stop and reconcile). Flag `[REAL]` rows for tier-2 handling. Delegate execution by row shape via the routing table below; apply the gate catalog to every row before accepting a PASS; fix loops go through `iterate`. DoD = 100% PASS or honest INV — nothing between.

**side-effects / deploy-verify / pr-review.** Dispatch to the bundled skill (`skills/side-effects/SKILL.md`, `skills/deploy-verify/SKILL.md`, `skills/pr-review/SKILL.md`). Each applies the same gates and returns rows in the same report format.

### Routing table (owned here — CB-3, reference by name, never inline)

| Work | Route to |
|---|---|
| Functional / CDP UI QA against a test plan | `fable-it:full-qa` |
| Authenticated real-Chrome action (user's logged-in browser) | `fable-it:chrome-cdp-control` |
| Diagnose → fix → test loops | `fable-it:iterate` |
| LLM-function evals (closed-label classifiers, rubric outputs) | `make-eval` |
| Worktree / port / browser isolation for parallel runs | `parallel-lifecycle` (hard dependency — assumed installed, never absorbed) |

If a routed skill is missing in the host, perform that phase inline following the same principle it would have applied, and say so in the report — degrade, never break, and never claim the specialist ran.

## Step 5 — The honesty layer (every mode, before the report)

- **Evidence adapter** — a claim row must point at a same-session tool result (command output, screenshot path, API response). VERIFIED is a lookup into the evidence ledger, not a judgment call.
- **System-of-record adapter (R6)** — any delegated, state-mutating claim is re-derived at the DB / API / DOM-count before acceptance. Subagent narration is provisional, never evidence.
- **Fresh-context verifier (R7)** — a verifier with NO access to the run conversation gets only: the DoD/contract, the draft report, and the evidence (including the screenshot dir, with license to challenge rows whose pixels contradict prose). Every CHALLENGE resolves by re-verify or demote — never by prose.

The full protocol and prompts live in `references/report-format.md`.

## Step 6 — Report (FR1.4)

Emit exactly one report in the `references/report-format.md` schema, to the consumer repo's `.review-it/` (or `.fable-it-reports/` when conducted by fable-it — in that case feed rows into fable-it's evidence ledger instead of issuing a competing verdict).

Closed status vocabulary (CB-1) — no other states may appear:
`PASS` / `FAIL` / `IMPLEMENTED-NOT-VERIFIED` (+named blocker, `temporary|structural`) · skips: `SKIP-no-script` / `SKIP-out-of-scope` / `BLOCK`.
Every row carries its oracle-provenance tag (`AUTHORED` | `DERIVED`). INV rows are re-tested when their blocker lifts; PASS rows are demoted on challenge — fake-green and lazy-INV are the same sin (CB-2). Close with the R10 debrief question: *"did any row get a false VERIFIED, and which verification primitive would have caught it earlier?"*

## Credential boundaries (§4.1)

- Never propose a new credential storage location. Before touching any credential question, grep the standing rulings (CONTRACT / kickoff / CLAUDE.md / canonical creds files such as `.secrets/.full.credentials`, `LOCAL-CREDENTIALS.md`) and quote the incumbent ruling back (gate R5). Default to the incumbent pattern.
- Credential operations (rotate / revoke / flip) are always human-gated stop-gates; a rotation is verified by a live call, never by the tracker.
- Real-Chrome sessions route to `fable-it:chrome-cdp-control` with its per-write confirmation gate; autonomous QA never touches an authenticated session.

## What NOT to do

- Do not re-implement `full-qa`, `iterate`, `chrome-cdp-control`, `make-eval` or `parallel-lifecycle` — route by name (CB-3).
- Do not report VERIFIED off a mock, an assumption, or subagent narration (R6; Guardrail: evidence adapter).
- Do not let a DERIVED-oracle green masquerade as "obeys the plan" (R11 / CB-9).
- Do not skip silently — every non-run case is SKIP-no-script, SKIP-out-of-scope, BLOCK or INV with a named blocker (CB-1).
- Do not write to consumer repos outside the report/ledger conventions; no destructive ops without the safety ladder (CB-8).
- Do not wire a new gate/checklist without proving it can fail — a deliberately broken case must go red first (CB-7).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
