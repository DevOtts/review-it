# do-it integration — it-result/1, attended gate, shared vocabulary

How review-it fits the do-it spine. Source of truth: do-it `delivery/CONTRACT.md` section 2 (schemas) and section 9 (G-n rules); change catalog: do-it `plugins/do-it/catalog/companion-changes.md` (sections "all companions" and "review-it"). Everything here is additive: standalone runs keep writing `.review-it/` exactly as `report-format.md` says.

## 1. Root resolution (`DO_IT_HOME`)

1. `DO_IT_HOME` set: use its value.
2. Unset inside a linked git worktree: `{main checkout}/.do-it` (the parent of `git rev-parse --git-common-dir`).
3. Unset in the main checkout: `{repo}/.do-it`.

Legacy paths (`.review-it/`, `.build-it-reports/`, `.taskstate/`) are a read fallback for resume; the do-it code paths never create them.

## 2. Paths and writers (one writer per path)

| Path | Writer | Readers |
|---|---|---|
| `.do-it/review/ATTENDED-GATE.html` | review-it | do-it, build-it, conclude-it |
| `.do-it/review/roteiro.json` | review-it | do-it |
| `.do-it/review/findings.json` | review-it | build-it, do-it |
| `.do-it/runs/{run_id}/state.json` | spine | review-it, build-it, conclude-it |

review-it never writes `state.json` (G-1). `ATTENDED-GATE.html` is re-cut every round: rewritten whole, never appended. The roteiro (the attended walk-through script for the human) is frozen once per round and fingerprinted (sha256 of its canonical JSON); a round whose fingerprint equals the previous round's is a repeated round, not progress, and is reported as such so the review loop can take its STALLED exit.

## 3. Severity classes (ruling D2)

`blocker`, `major`, `minor`, `nit` (lowercase in files). `pr-review` keeps its display words BLOCKER / MAJOR / MINOR / NIT; they map 1:1. Only blockers and majors loop (G-10).

## 4. Result vocabulary in `it-result/1`

Verdicts carried in the file: `VERIFIED`, `IMPLEMENTED-NOT-VERIFIED`, `BLOCKED`. review-it keeps its own display words in the human report; the mapping is:

| review-it report | it-result/1 verdict |
|---|---|
| `PASS` | `VERIFIED` (only with evidence that resolves to a file or ID, G-2; a `[REAL]` row is never VERIFIED on a mock, G-3) |
| `FAIL` | `BLOCKED` |
| `IMPLEMENTED-NOT-VERIFIED` | `IMPLEMENTED-NOT-VERIFIED` |
| `SKIP-*` / `BLOCK` | `BLOCKED` with the skip reason in `evidence` |

Run verdicts: `DONE_ALL_VERIFIED`, `DONE_WITH_RESIDUALS`, `BLOCKED`, `NEEDS_RESET`, `USAGE_LIMIT`. A DERIVED-oracle green stays "self-consistent" and may not yield `DONE_ALL_VERIFIED`.

## 5. Writing `it-result/1` (G-1: last act of the stage)

Fields: `schema`, `stage` (`review-it`), `run_id`, `slice_id`, `version`, `head_sha`, `status`, `exit_code`, `verdicts` (`row`, `verdict`, `evidence`, `real`), `run_verdict`, `next`, `pending_human`, `artifacts` (`path`, `kind`, `sha256`), `resume` (`state_files`, `next_action`), `tokens` (`meter`, `peak_ctx`, `tier_mix`, `estimated`).

- `status`: `ok`, `needs_human`, `blocked`, `failed`, `context_reset`, `usage_limit`. `exit_code` mirrors it: ok 0, failed 1, needs_human 2, blocked / usage_limit / context_reset 3.
- Write to a temp file in the same directory, then rename. Never write partial output.
- Never state token usage yourself; leave `tokens` to the meter (G-6). Never put credential values in any field (G-7).
- Only when running under do-it (a `run_id` is supplied). Standalone runs skip this file.

## 6. Tier vocabulary

Ask for a tier, never a model name: T1 powerful (hard reasoning, needs a written reason or is downgraded, G-4), T2 balanced (default), T3 cheap (deterministic and gather work). The host maps tiers to models.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
