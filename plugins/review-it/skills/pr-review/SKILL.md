---
name: pr-review
description: SECONDARY review-it mode — the PR-review PROCESS wrapper. Produces severity-tiered (BLOCKER/MAJOR/MINOR/NIT), evidence-cited (file:line) findings with a blocking-vs-advisory split, loading the consumer project's checklist from .claude/review-config.md (works with zero config via a generic checklist). It does not duplicate /code-review — it may invoke code-review-style passes as executors and wraps them in process: scope, checklist, severity, evidence, verdict. Invoked by /review-it when the target is a PR ref/branch/diff, or standalone when the user says "review this PR", "review the diff", "pre-merge review".
version: 1.0.0
license: MIT
author: DevOtts
author_url: https://github.com/DevOtts
homepage: https://github.com/DevOtts/review-it
repository: https://github.com/DevOtts/review-it
keywords: [pr-review, code-review, severity, checklist, review-config, qa]
---

# /pr-review — the review process wrapper

You are a *process*, not another linter: scope the diff, load the project's checklist, tier every finding by severity with a `file:line` citation, split blocking from advisory, and emit a verdict. Finding bugs line-by-line is the executor's job — `/code-review` (or an equivalent reviewer pass) runs under you; you own what it runs against and how its output becomes a decision (FR3.3, CB-3).

Gates applied here: **R6 narration≠evidence** (executor findings are re-read at the cited lines before they tier), **R9 environment-identity** (review the PR's head, not a stale local), **R11 oracle-provenance** (the PR description/linked issue is the AUTHORED oracle for "does this do what it claims") — specs in `references/gate-catalog.md`.

## Step 1 — Scope (FR3.1)

- Resolve the diff surface: base…head, files touched, tests touched, migrations, config/CI edits. Review `origin/<head>` — never a possibly-stale local checkout (R9).
- Read the PR description + linked issue: that text is the authored oracle for intent (R11) — a PR that does something other than it claims is a finding even if the code is clean.

## Step 2 — Load the checklist config (FR3.2)

- Look for **`.claude/review-config.md`** in the consumer repo — the convention for project-scoped review checklists (first instance: Engine-Core's absorbed `review-pr` checklist).
- No config ⇒ run with the generic checklist: security (secrets, injection, authz, input validation) · correctness (edge cases, error handling) · tests (new surface covered, existing green, no self-grading mocks per `references/authoring-standards.md`) · migrations/data safety (CB-8 ladder) · naming/dead code · docs/breaking-change notes. Zero config is never a reason to refuse.
- Config sections marked blocking-vs-advisory are honored; unmarked sections default to: security + data-safety = blocking, style/docs = advisory.

## Step 3 — Execute review passes

Run the reviewer executor(s) over the scoped diff against the loaded checklist — invoke `/code-review` where available rather than re-implementing line-review logic. Executor findings are narration until you re-read the cited lines yourself (R6): confirm the code at `file:line` actually shows what the finding claims before it tiers.

## Step 4 — Tier + cite (FR3.1)

Every surviving finding gets exactly:
- **Severity:** `BLOCKER` (must fix before merge: security holes, data loss, broken contract) · `MAJOR` (should fix: correctness risk, missing tests on new surface) · `MINOR` (worth fixing: smells, small gaps) · `NIT` (style/preference).
- **Evidence:** a `file:line` citation + one-line quote of the offending code. A finding without a citation does not ship.
- **Checklist ref:** which config/generic item it violates.

## Step 5 — Verdict

- **Blocking set** = BLOCKERs + any MAJOR from a config-marked blocking section. Blocking set empty ⇒ `APPROVE (advisories attached)`; else ⇒ `REQUEST-CHANGES` listing exactly what gates the merge.
- Advisories never gate; they ship as a separate list.
- Report per `references/report-format.md` (findings replace verdict rows; preflight, ledger and R10 debrief stay).

## What NOT to do

- Do not duplicate `/code-review` logic — invoke it as the executor (FR3.3, CB-3).
- Do not tier a finding you have not re-read at the cited line (R6).
- Do not emit findings without `file:line` evidence.
- Do not let advisories block, or blockers hide as advisories, to make the verdict friendlier.
- Do not review a stale local checkout (R9).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
