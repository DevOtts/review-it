# Usage

## The four invocations

```bash
/review-it qa/test-plan-master.md   # contract-qa (PRIMARY)
/review-it PR #42                   # pr-review
/review-it staging                  # deploy-verify (also: prod, a release ask)
/review-it apps/sync-feature/       # side-effects (DoD includes third-party writes)
```

Mode is detected from the target (front door Step 1); mixed targets run modes in
sequence. Every run starts with the R9 preflight (which app/branch/checkout is under
test) and the verifiability precheck (unreachable ⇒ honest INV, never a mocked green).

## contract-qa — the primary mission

Point it at a plan-it Test Contract. It tallies declared vs counted cases, flags
`[REAL]` rows for tier-2 handling, delegates execution by row shape (UI → `full-qa`,
fix loops → `iterate`, LLM boundaries → `make-eval`), applies the gate catalog to every
row, and reports 100%-or-honest-INV.

## With no Test Contract

review-it never refuses and never self-grades. The no-contract ladder:

1. **Locate** an authored oracle — plan-it Test Contract → plan-it DoDs/goals →
   fable-it DoD/ledger → PRD/epic criteria → PR/issue/commit description.
2. **Derive** cases from the change surface only if nothing is found.
3. **Confirm** derived cases with you before running (or stamp the run
   `DERIVED-UNCONFIRMED` under autonomy).
4. **Label** every verdict `AUTHORED` or `DERIVED` — a DERIVED green means
   "self-consistent," never "obeys the plan."
5. **Persist** the resulting contract to `qa/test-plan-derived.md` — durable coverage
   plan-it can absorb later.

## Reading the report

Reports land in `.review-it/` (or fable-it's ledger when conducted). The status
vocabulary is closed: `PASS` / `FAIL` / `IMPLEMENTED-NOT-VERIFIED` (+ named blocker,
`temporary|structural`), skips `SKIP-no-script` / `SKIP-out-of-scope` / `BLOCK`.
Deploy-verify adds a `READY / NOT-READY` release verdict. Every run ends with the R10
debrief: *did any row get a false VERIFIED, and which primitive would have caught it?*

## Project config for pr-review

Drop a `.claude/review-config.md` checklist in the consumer repo (sections tagged
`[blocking]` / `[advisory]`). Zero config works too — a generic checklist applies.

## Under fable-it

fable-it invokes review-it as its QA phase; verdict rows feed fable-it's
`.taskstate/evidence.md` directly — same row schema, one source of truth
(`references/report-format.md`).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
