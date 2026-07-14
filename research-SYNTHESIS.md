# Research Synthesis — consolidated QA/testing/review skill (test-it / review-it / qa-it)

**Date:** 2026-07-14 · Synthesized from the 5 findings in `research/` (A: qa-system docs, B: skills inventory, C: e2e-session digest, D: airtable postmortem, E: session-history mining). Read those for evidence and exact quotes; this file is the design-input distillation.

## 1. What the new skill IS (net shape — converged across all 5 findings)

**The QA front door** for the Devotts lifecycle family — analogous to how fable-it is the delivery front door and plan-it the planning front door. It:

- **Consumes** a plan-it **Test Contract** (or authors one if none exists) as its canonical input; its DoD = 100% of the contract passing or honestly INV'd.
- **Routes** to existing specialists rather than re-implementing them: `full-qa` (functional/CDP QA), `iterate` (fix loops), `chrome-cdp-control` (real-Chrome writes), `make-eval` (LLM-function evals), `parallel-lifecycle` (isolation infra — a dependency, never absorbed).
- **Owns what nothing currently owns** (gap map, finding B §3): PR-review *process* (not just checklist), unit-test authoring standards, production-readiness/release gates, **third-party side-effect verification**, flake/regression triage, fixture/seed discipline, and the single evidence-ledger-backed report format shared with fable-it.
- **Feeds** fable-it: its verdict rows plug into fable-it's evidence ledger / fresh-context verifier flow, not compete with it.

## 2. The load-bearing vocabulary & models to encode (from the shipped Engine QA System — finding A)

1. **Two-axis classification of every test case**: TYPE (unit · e2e · golden-value · adversarial/inverse-op · grep-proof · [REAL]) × **PERSISTENCE** (CI-persisted · script-persisted · harness-primitive · one-time-live · parked). "What does it check?" AND "will anything rerun it tomorrow?" are separate questions; a one-time-live invariant is a silent gap.
2. **Three-tier gate model**: Tier 0 PR-blocking = deterministic AND service-free only; Tier 1 service-backed lane starts report-only (`continue-on-error`), promoted only after stability bar; Tier 2 [REAL] live-target checks NEVER block a PR — scheduled/pre-release checklist.
3. **Status vocabulary**: PASS / FAIL / **IMPLEMENTED-NOT-VERIFIED (INV) with a precise named blocker** — never collapsed into PASS, and re-promoted to real PASS when the blocker lifts ("fake-green and lazy-INV are the same sin in opposite directions"). Distinguish *temporarily* vs *structurally* unreachable. Skip taxonomy: PASS / SKIP-no-script / SKIP-out-of-scope / BLOCK — never a silent bare pass.
4. **Adversarial proof of every gate**: a gate isn't done until a deliberately-broken case made it go red (sabotage prod code, marked revert-me commit, capture failing+passing CI run IDs). "Verify the verifier": coverage audits need planted negative controls (synthetic uncovered invariant must come out GAP; fabricated case_id must be rejected).
5. **CI-mechanics rules**: extend-never-clobber (read the LIVE workflow file, byte-diff after); wire-only-scripts-that-exist (dead `test:e2e` scripts found in 3 repos); CI/origin-main is the verification surface, never a local checkout (contaminated by parallel sessions' worktrees/branches).
6. Methodology invariants worth porting as default guidance: live-drift-aware golden asserts; auth tests over service DNS not localhost-exec; grep-is-not-proof-of-deadness; code-grep needs DB-syntax filters; safety ladder (`backup → grep → soft-delete → soak → hard-delete → verify`) for destructive ops.

## 3. The failure classes the skill must gate against (findings D + E — the "why")

Fernando's 3 Airtable flags root-caused (D §2) plus the corpus-wide patterns (E §1):

| # | Failure class | Canonical incident | Gate to encode |
|---|---|---|---|
| 1 | **Verified in the wrong layer** | Airtable `task_id` primary-field bug: all API GETs correct, record rendered "empty" in Airtable's UI | **Third-party write gate**: a write is VERIFIED only when read back from the surface a human will look at — API GET **and** UI render when both exist. GET-only ⇒ `INV-in-UI`. |
| 2 | **Asserted presence, not operability** | 4 combobox bugs behind a "verified" modal: CDP checked rendered text + terminal 403, never typed/opened/selected | **Interactive-control coverage gate**: every control touched by the DoD needs (a) initial state, (b) its primary interaction (type into search, open popover, select NON-default option), (c) post-action state. "Shows a value" ≠ "is operable". |
| 3 | **Single read as evidence** | Airtable read-after-write lag: record read back null once, populated on re-reads | **Read-back stability gate**: unexpected read-after-write results re-read 2–3×; log the sequence. A null result is never evidence — prove the positive. |
| 4 | **First real-world test done by the human, un-instrumented** | Fernando flipped `enableWrites` + created the task before the session's "sanctioned #W4 verification" ran | **First-look gate**: when an action is human-reserved, explicitly ask "ping me before you act" or poll to observe first state; never assume first look. |
| 5 | **Standing directives not consulted** | Credentials/k8s-env question despite the brain-connector creds directive | **Directive-lookup gate**: before proposing any credential location / new mechanism, grep CONTRACT + kickoff + CLAUDE.md + creds files for an existing ruling and quote it back; default to the incumbent pattern. |
| 6 | **Subagent narration trusted as verification** | Haiku CDP agents echoing instructions back as "results"; E2's first false-green self-report | **System-of-record gate**: delegated state-mutating claims verified at DB/API/DOM-count, never narration. Conductor independently re-derives load-bearing claims (row counts, byte-diffs, CI conclusions) before merge. |
| 7 | **Evidence text contradicting evidence pixels** | Pulse r3: ledger said PASS, screenshot showed the regression | **Verifier-reads-pixels rule**: fresh-context verifier gets the screenshot dir and license to challenge rows whose images contradict prose. |
| 8 | **Deploy/status proxies trusted** | `MERGED`+"Ready" while code not live; `npm ci \|\| true`; workflow_dispatch-only CI; docker layer-cache caching a failed install as success | **Verify-deployed-code gate**: curl the new route / grep served HTML / digest-pin; "merged" ≠ "deployable" ≠ "deployed". |
| 9 | **Environment confusion → testing the wrong thing** | Loudr on :3000 actually Engine-Core; stale local branch grep'd as "coverage missing"; rtk wrapper lying | Preflight: assert WHICH app/checkout/branch is under test before any verdict (parallel-lifecycle's `.env.worktree` contract + origin-resolution rule). |
| 10 | **Debrief captures bugs, not the methodology hole** | Airtable debrief logged 4 tactical lessons, zero process lessons | **Debrief methodology prompt**: "did any DoD item get a false VERIFIED, and what verification primitive would have caught it earlier?" |

## 4. Proven wins to build ON (not reinvent)

- fable-it v2's **evidence ledger** ("VERIFIED is a lookup, not a judgment call") + **fresh-context verifier** + verifiability precheck — the new skill adopts these mechanics and report format.
- **One-slice-then-human-review before fan-out**; model tiering (haiku mechanical / sonnet spec'd / fable adversarial+contract reasoning) with escalation-on-struggle, recorded in the run report.
- **plan-it Test Contract** as input format (Specification by Example; type-selection table by implementation shape; [REAL] case designation).
- Prior consolidations to reference, not redo: `wiki/entities/projects/engine-core/features/qa-system/lessons.md` (L1–L6), `Engine-Core/.fable-it-reports/lessons.md` (Step-0 read), `brain-docs/operations/raw-cdp-prod-app-qa.md`, `chrome-cdp-control` SKILL §14, concepts `verify-deployed-code-not-deploy-status` + `verification-through-the-product`, `LOUDR-CLAUDE-SESSION-HISTORY.md` §5–6.

## 5. Consolidation moves (finding B §5)

- **Fork from fable-it's bundled `full-qa`** (route guard, dry-loop exploratory, no-silent-caps, env-resolved CDP_URL) — the standalone `~/.claude/skills/full-qa` is superseded: deprecate/pointer it.
- **Absorb `review-pr`'s checklist as a project-scoped reference/config** loaded by a new PR-review *mode* with process (severity tiers, evidence, blocking-vs-advisory) — don't reinvent `code-review`.
- **Depend on** parallel-lifecycle, chrome-cdp-control, iterate, make-eval by name ("never paste a worse copy").
- **Packaging**: Devotts family layout — `<repo>/.claude-plugin/marketplace.json`, `plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/skills/<skills>/SKILL.md` + shared `skills/references/`, top-level convenience SKILL.md, DevOtts frontmatter + footer (author: DevOtts, https://github.com/DevOtts).

## 6. Open decisions for the plan-it human gate

1. **Name**: test-it / review-it / qa-it (session named "review-it-skill-plan" — weak signal; scope leans broader than review).
2. **Scope boundary vs fable-it**: does the new skill own the fresh-context verifier + evidence ledger, or keep referencing fable-it's? (Recommendation: shared reference doc, single source of truth.)
3. **Sub-skill split**: one mono-skill with modes vs bundled skills (e.g. `qa-it` front door + `review-mode` + `readiness-mode`) — fable-it precedent favors a front door + bundled specialists.
4. Fate of standalone `~/.claude/skills/full-qa` and Engine-Core `review-pr` (deprecate vs pointer).
5. Whether third-party side-effect verification ships as its own sub-skill/reference (connector-heavy Engine work suggests yes).
