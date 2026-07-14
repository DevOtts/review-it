---
name: deploy-verify
description: Staging/prod deploy verification — proves the build actually works in the live environment, not that a dashboard says "Ready". Runs the deployed-code ladder (curl the new route, grep served HTML, digest-pin — merged ≠ deployable ≠ deployed), re-runs the Test Contract's [REAL]-tagged cases against the live env under Tier-2 rules, walks the release checklist (rollback, monitoring, feature flags, migration safety, credential hygiene), and emits READY / NOT-READY with per-item evidence. Invoked by /review-it when the target is "staging"/"prod"/a release, or standalone when the user says "verify the deploy", "is it actually live", "pre-release check", "can we ship this".
version: 1.0.0
license: MIT
author: DevOtts
author_url: https://github.com/DevOtts
homepage: https://github.com/DevOtts/review-it
repository: https://github.com/DevOtts/review-it
keywords: [deploy, staging, prod, release, deployed-code-ladder, readiness, qa]
---

# /deploy-verify — staging/prod verification

You prove a build works **where it will actually run**. Status proxies — `MERGED`, "Ready", a green layer-cached build — are never deploy evidence (gate R8). The failure class this mode kills: a "merged + Ready" deploy whose new route 404'd in prod.

Gates applied here: **R8 deploy-truth**, **R4 first-look**, **R9 environment-identity**, **R3 read-stability** — full specs in `references/gate-catalog.md`; tiers/statuses in `references/vocabularies.md`; report rows per `references/report-format.md`.

## Step 1 — Deployed-code ladder FIRST (R8; FR4.1)

Before any functional check, prove the new code is actually serving in the target env. Climb until one rung gives positive proof:

1. **curl the new route/endpoint** — a route that exists only in the new code returning 200/401 (vs 404) proves the new code serves. (401 is proof too — the route exists behind auth.)
2. **grep the served HTML/JS** for a marker unique to the change (new string, build id, component id).
3. **digest-pin** — compare the running image/bundle digest against the built artifact's digest.

Preflight identity applies (R9): prove which env/URL/port you are hitting before trusting any rung. No rung passing ⇒ the deploy is NOT live; report FAIL on the ladder and stop functional verification — everything after would test the old code.

## Step 2 — Re-run [REAL] contract cases against the live env (FR4.2)

Pull the consumer's Test Contract (or derived contract) and re-run its `[REAL]`-tagged rows against staging/prod — this is the "test it working there" leg. Tier-2 rules (vocabularies §2) bind:
- These runs **never block a PR** — they inform the release verdict.
- Unreachable live target ⇒ honest `IMPLEMENTED-NOT-VERIFIED` with named blocker (`temporary|structural`) — never a mock stand-in ([REAL] is never VERIFIED on a mock).
- Execution routes by row shape: UI rows → `fable-it:full-qa`, API/state rows → direct calls with ledger entries, fix loops → `fable-it:iterate` (CB-3).
- Human-reserved live actions (prod credential flips, first live write) are `BLOCK` stop-gates carrying the R4 first-look ask — "ping me before acting," or poll to observe first state; the human is never the un-instrumented first tester.

## Step 3 — Release checklist (FR4.3)

Walk each item to a PASS/INV row with evidence:
- **Rollback plan** — named, executable (previous image/release tag reachable), not "revert the PR".
- **Monitoring/alerting** — the new surface is covered (dashboard, alert rule, log query named).
- **Feature-flag state** — flags gating the change are in the intended state in THIS env; quote the flag read.
- **Migration safety** — destructive migrations follow the safety ladder (`backup → grep → soft-delete → soak → hard-delete → verify`, CB-8); irreversible steps are human-gated.
- **Credential hygiene** — no new secrets in the bundle/env dump; credential operations human-gated, rotations verified by live call (R5/CB-6).

## Step 4 — Verdict (FR4.4)

Emit `READY` / `NOT-READY` assembled ONLY from the per-item rows: any ladder FAIL ⇒ NOT-READY; Tier-2 INVs force an honest row and a human decision, not silent green. Report per `references/report-format.md`, R10 debrief included.

## What NOT to do

- Do not accept MERGED / "Ready" / green CI / cached builds as deploy evidence (R8).
- Do not run functional checks before the ladder proves the new code serves — you'd verify the old build.
- Do not mock an unreachable staging/prod target — INV with named blocker (Tier-2).
- Do not perform human-reserved prod actions autonomously (R4; BLOCK stop-gate).
- Do not inline QA/fix-loop/browser logic — route to `fable-it:full-qa` / `fable-it:iterate` / `fable-it:chrome-cdp-control` by name (CB-3).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
