# Test Contract — derived (review-it, no-contract ladder)

Source repo: `qa/fixtures/dod-only` (consumer repo root, inside the `review-it` monorepo checkout)
Authored by: `/review-it` run, contract-qa mode, no-contract ladder (FR1.5)
Oracle located at: **step (a) Locate** — `delivery/PRD-mini.md` (plan-it-shaped Goals + Definition of Done, authored before the build). No `qa/test-plan*.md` exists in this fixture (by design — this fixture exercises the "DoD-only" leg of the ladder). Derive/step (b) was not needed.

Every case below is an **expansion** of an authored DoD/goal statement into a runnable check. Per Step 3(a)/R11, expanding an AUTHORED oracle into runnable cases keeps **AUTHORED** provenance — the expected values were fixed at plan time in PRD-mini.md, not reconstructed from `src/format.mjs`.

No human was available to ack/edit these cases before the run (Step 3(c)); per the skill's rule for that situation the run proceeded rather than stalling. Because the oracle itself is AUTHORED (not reconstructed from the implementation), the `DERIVED-UNCONFIRMED` run stamp does not apply here — that stamp is reserved for **DERIVED** oracle sets per `vocabularies.md` §4 ("a DERIVED set executed under autonomy without human confirm"). The absence of a human confirm pass is instead recorded as a process note in the review-it report.

| Case ID | Type | Persistence | [REAL]? | Given/When/Then | Assertion | Oracle | Source |
|---|---|---|---|---|---|---|---|
| T-DOD-01 | unit | script-persisted | no | Given the ASCII sentence `"the quick brown fox"`, when `titlecase()` is called, then it returns `"The Quick Brown Fox"` | `titlecase("the quick brown fox") === "The Quick Brown Fox"` | AUTHORED | PRD-mini.md DoD #1 / Goal G-1 |
| T-DOD-02 | unit | script-persisted | no | Given the full name `"ada lovelace"`, when `initials()` is called, then it returns `"A.L."` | `initials("ada lovelace") === "A.L."` | AUTHORED | PRD-mini.md DoD #2 / Goal G-2 |
| T-DOD-03 | unit / grep-proof | script-persisted | no | Given `src/format.mjs`, when imported via a plain `node` ESM import, then both `titlecase` and `initials` are exported functions and each is callable and returns a string | `typeof titlecase === "function" && typeof initials === "function"`, both callable, both return strings | AUTHORED | PRD-mini.md DoD #3 |

## Coverage map
- G-1 → T-DOD-01
- G-2 → T-DOD-02
- DoD #3 (export/callability) → T-DOD-03
- No governance/gate rule is claimed by this PRD (pure formatting, no third-party writes, no auth, no destructive op) → no inverse-op/negative case is authored; see Accepted-gaps register in the review-it report for this explicitly noted, not silently capped.

## Tier
All three cases are **Tier 0** — deterministic, service-free, runnable via plain `node`, safe to be PR-blocking once wired into CI (none exists yet in this fixture — `script-persisted` only, not `CI-persisted`).

## Re-run
```
node -e '...'  # or promote to a real *.test.mjs + a `node --test` runner
```
Each case above was executed 3x in the originating review-it run (initial + 2 re-reads, R3) with identical results — see the run report for the evidence ledger.
