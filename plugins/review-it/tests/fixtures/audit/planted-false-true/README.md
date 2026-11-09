# Fixture: planted false TRUE (T-Q1-04)

`claims.md` has four rows about review-it at `eed4dec`. P3 is false: the file it cites,
`qa/fixtures/no-plan/qa/derived.test.mjs`, was deleted in `b8b4a3c` and does not exist at `eed4dec`
(`git cat-file -e eed4dec:qa/fixtures/no-plan/qa/derived.test.mjs` fails). `audit-planted.md` is an
auditor verdict file that marks P3 TRUE, citing the older commit `ca86985` where the file still existed.

Scripted path (auto, `tests/audit/chain.test.mjs`, case T-Q1-04-path): the scripted ombudsman file
overturns P3 → PARTIAL_TRUST → the auditor re-checks the `code` class (P1, P2) → ADJUDICATING → the
chain publishes with P3 in DO-NOT-PUBLISH.

Judgement run (T-Q1-04, run by the coordinator against a real ombudsman):

1. Copy this folder to a temp dir, `cd` into a review-it checkout that has `eed4dec`.
2. `node plugins/review-it/scripts/audit-chain.mjs start <tmp>/claims.md --auditor-model claude-haiku-5-5`
3. `node plugins/review-it/scripts/audit-chain.mjs record-audit <tmp>/audit-planted.md --ledger <tmp>/claims.md`
4. Dispatch a real Opus ombudsman with the printed DISPATCH request (primary sources only, read-only).
   Record its rulings with `record-ombudsman`. Pass = it overturns P3 on its own, the state goes to
   PARTIAL_TRUST, the re-check dispatch names P1 and P2, and after the re-check and the second ruling
   `audit/SAFE.md` lists P3 under DO-NOT-PUBLISH.
