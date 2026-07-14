# Report format — the single source of truth (shared with fable-it)

One report schema for every review-it mode, and the same evidence-ledger row schema fable-it uses — **this file is the single source of truth for both plugins** (PRD D2/CB-5: review-it hosts it; fable-it points here). If you change a field, you are changing fable-it's ledger too — don't, without a dated amendment.

## 1. Evidence-ledger row (the atom)

One entry per criterion per verification attempt, appended **the moment the attempt happens**, never reconstructed at report time:

```
| ts | criterion/case | command | quoted output | verdict |
```

- `ts` — timestamp of the attempt.
- `command` — the exact tool invocation (command line, API call, CDP action).
- `quoted output` — verbatim excerpt of the tool result (response body, row count, HTTP status, screenshot path). Not a paraphrase.
- `verdict` — one of the closed statuses (§3).

**The claim rule:** a row may be reported PASS/VERIFIED **only if the ledger holds a passing same-session tool result for it**. VERIFIED is a lookup, not a judgment call. No entry ⇒ the row is IMPLEMENTED-NOT-VERIFIED, mechanically.

Location: consumer repo `.review-it/` for standalone runs; when conducted by fable-it, append to its `.taskstate/evidence.md` instead of keeping a competing ledger.

## 2. Report skeleton

```
# review-it report — <target, one line>
Mode: <contract-qa|side-effects|deploy-verify|pr-review|sequence>   ·   Run: <start> → <end>
Preflight (R9): repo=<path> branch=<branch>@<sha> app=<identity/port> checkout=<clean|dirty>
Oracle: <AUTHORED (source) | DERIVED | DERIVED-UNCONFIRMED>   ·   Contract: <path> (declared N / counted N)

## Verdict rows
| Case | Oracle | Status | Evidence (ledger ref) / Blocker |
|------|--------|--------|---------------------------------|
| T-E1-01 | AUTHORED | PASS | <quoted output or ledger row ref> |
| ...  | DERIVED  | PASS (self-consistent — NOT verified-against-plan) | ... |
| ...  | AUTHORED | IMPLEMENTED-NOT-VERIFIED | blocker: <named> (temporary|structural) |

## Accepted-gaps register
- <cases that could not be anchored to any oracle — no silent caps>

## Challenges (fresh-context verifier)
- <row>: CHALLENGE <reason> → resolved by <re-verify|demote>

## Debrief (R10)
Did any row get a false VERIFIED this run, and which verification primitive would have caught it earlier?
<answer — a process lesson, not just a bug list>
```

Deploy-verify runs add a `READY / NOT-READY` release verdict with per-item PASS/INV rows (see `skills/deploy-verify/SKILL.md`). PR-review runs replace verdict rows with severity-tiered findings (see `skills/pr-review/SKILL.md`) but keep the ledger, preflight and debrief sections unchanged.

## 3. Statuses

Closed vocabulary (CB-1) — defined in `references/vocabularies.md`; the report may contain no state outside it. Every row carries its oracle-provenance tag (R11).

## 4. The honesty adapters (run before delivery, every mode)

**Evidence adapter.** Walk every PASS row: does it point at a same-session tool result? No ⇒ demote to INV. This is mechanical, not judgment.

**System-of-record adapter (R6).** Walk every row whose evidence came from a delegated executor: re-derive the load-bearing claim at the record of truth (DB query, API GET, DOM count) before acceptance. Narration alone demotes to FAIL/INV citing the record-of-truth result.

**Fresh-context verifier (R7).** Spawn a verifier with NO access to the run conversation. Give it exactly three inputs and this prompt:

> You are a fresh-context verifier auditing a QA report. You have no access to the run conversation and must not seek it. Read ONLY: (1) the DoD / Test Contract, (2) the draft report, (3) the evidence ledger — plus the screenshot directory if one exists; you are licensed and expected to open the screenshots and challenge any row whose pixels contradict its prose. Challenge by default: for every row marked PASS/VERIFIED, look up its ledger entry; CHALLENGE if no entry exists, or the quoted output does not demonstrate the criterion (wrong target, mock data, missing assertion, DERIVED oracle presented as verified-against-plan). Return one line per row: CONFIRM or CHALLENGE + reason.

Every CHALLENGE resolves by **re-verify or demote** — never by prose. Hosts without subagents: run the same checklist as a separate pass under the same reading restriction, stating "setting aside the run context."

---
_Authored by [DevOtts](https://github.com/DevOtts)._
