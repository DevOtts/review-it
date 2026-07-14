# Vocabularies — classification axes, tiers, statuses

The closed vocabulary every review-it mode (and fable-it, via `report-format.md`) speaks. Terms outside these sets may not appear in a report (CB-1).

## 1. Two-axis test classification: TYPE × PERSISTENCE

Every case answers two independent questions — "what does it check?" and "will anything rerun it tomorrow?" A high-value invariant that nothing reruns is a silent gap, not coverage.

**TYPE** (what it checks):
| Type | Meaning |
|---|---|
| `unit` | one function/module, mock boundaries per authoring-standards |
| `e2e` | full stack through the real surface (API and/or UI) |
| `golden-value` | deterministic, hand-computed expected values |
| `adversarial` / `inverse-op` | deliberately violates a rule/gate and asserts the gate FIRES |
| `grep-proof` | structural assertion over the repo (reference-by-name, attribution, no inlined copy) |
| `[REAL]` | requires a live third-party / live env / real browser — never VERIFIED on a mock |

**PERSISTENCE** (who reruns it):
| Persistence | Meaning |
|---|---|
| `CI-persisted` | wired into a workflow that runs on PR/schedule |
| `script-persisted` | a committed script/fixture anyone can rerun |
| `harness-primitive` | lives in a reusable harness (make-eval dataset, full-qa plan) |
| `one-time-live` | ran once against a live target — flag it: it is not durable coverage |
| `parked` | registered, deliberately not running; must carry a reason |

## 2. Three-tier gate model (where a check may block)

| Tier | What | May block a PR? |
|---|---|---|
| **Tier 0** | deterministic AND service-free (lint, unit, golden-value, grep-proof) | Yes — PR-blocking |
| **Tier 1** | service-backed (DB, local stack) | Report-only (`continue-on-error`) until it has a stability record; promote only then |
| **Tier 2** | `[REAL]` live-target checks (staging/prod, third-party) | **Never** — scheduled / pre-release checklist only |

## 3. Status vocabulary (closed — CB-1)

- `PASS` — the real check ran and passed; evidence-ledger entry exists (same session).
- `FAIL` — the real check ran and failed.
- `IMPLEMENTED-NOT-VERIFIED` (INV) — built but not verifiable now; **must** carry a named blocker tagged `temporary` (env down, quota, blocker lifts) or `structural` (no such surface exists). INV is re-tested when the blocker lifts; INV left to rot ("lazy-INV") is the same sin as fake-green (CB-2).
- Special form `INV-in-UI` — third-party write verified by API GET only, UI surface unchecked (R1).

**Skip taxonomy** (a non-run case is never silent):
- `SKIP-no-script` — no runnable script/fixture exists yet.
- `SKIP-out-of-scope` — explicitly fenced out this run.
- `BLOCK` — a stop-gate (human-reserved action, destructive op) is holding it.

## 4. Oracle provenance (R11)

- `AUTHORED` — the expected outcome traces to a source authored independently of (and normally before) the implementation: plan-it Test Contract, plan-it DoDs/goals, external spec, PR/issue description.
- `DERIVED` — the expected outcome was reconstructed from the implementation/diff itself. A DERIVED green = "self-consistent," never "obeys the plan" (CB-9).
- Run stamp `DERIVED-UNCONFIRMED` — a DERIVED set executed under autonomy without human confirm of the cases.

## 5. Release verdicts (deploy-verify mode)

`READY` / `NOT-READY` — assembled only from per-item PASS/INV rows; a single Tier-2 INV does not force NOT-READY by itself (it forces an honest row + a human decision), but a FAIL on the deployed-code ladder always does.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
