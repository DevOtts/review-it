# Test Contract Review — `review-it` (FD-2 human-review gate)

Reviewed-by: Fernando (DevOtts) 2026-07-14

This artifact records the human review of the draft Test Contract (`qa/test-plan-master.md`)
before it was frozen as binding at G3. The 20 cases were reviewed for coverage, honesty
(no fake-green), and inverse-op discipline (every gate rule has a case that proves it FIRES).

## Review outcome: APPROVED — bound as-is (no drops, no renames)

All 20 draft cases were accepted into the binding contract unchanged. Coverage confirmed:
every goal G-1..G-10 maps to ≥1 case, and every gate rule R1..R10 has a violation case that
asserts the gate catches it. The 4 `[REAL]` cases are correctly tagged and will be honest-INV'd
if their live targets are unreachable at build time.

## Draft → binding case map (all bound in `qa/test-plan-master.md` epic tables)

- T-E1-01..T-E1-07 — scaffold, routing, packaging, report-vocabulary, and (v1.1) the no-contract ladder + oracle-provenance (Covers G-1, G-7, G-8, G-11, R9, R11)
- T-E2-01..T-E2-02 — narration≠evidence, verifier-reads-pixels (Covers G-6, R6, R7)
- T-E3-01..T-E3-09 — side-effects (API+UI read-back, stability), operability, pr-review, deploy-verify (Covers G-2, G-3, G-4, G-5, R1, R2, R3, R4, R8)
- T-E4-01 — deprecations, no drifting duplicate (Covers G-9)
- T-E5-01..T-E5-03 — dogfood run, fresh-context verifier challenge, community-launch packaging (Covers G-10, R10)

## v1.1 amendment (2026-07-14) — reviewed

Added T-E1-06 (plan-it DoDs/goals present but no full contract → AUTHORED oracle, expand + label) and T-E1-07 (no plan artifact → DERIVED, no self-graded green). These bind the FR1.5 no-contract ladder, R11 provenance, and CB-9. Accepted: the DoDs/goals-as-authored-oracle path is the realistic common case and is correctly higher-trust than code-derived expectations.

## Reviewer notes

- The two origin failures (Airtable postmortem, research finding D) are each pinned to a
  dedicated inverse-op case that must FIRE: T-E3-02 (GET-only write → INV-in-UI) and
  T-E3-05 (rendered-text-only CDP pass → operability gate catches it).
- E5's dogfood cases are `[REAL]` and binding — review-it must be run on a genuine target
  and survive a fresh-context verifier before v1 ships. Approved as the DoD's teeth.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
