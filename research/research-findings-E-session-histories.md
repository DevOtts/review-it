<!-- Research finding for the new test-it/review-it/qa-it skill. Source: subagent report, session 'review-it-skill-plan' (Engine-Core cwd, 8fai subscription), 2026-07-14. Mining of consolidated session histories, vault lessons, fable-it reports -->

I have sufficient source material gathered. Here is the full report.

---

# QA/Testing Lessons Mining Report — last ~2 weeks (as of 2026-07-14)

## Sources consulted (exact paths)

| Source | Status |
|---|---|
| `/Users/macbook/Workspace/Loudr/LOUDR-CLAUDE-SESSION-HISTORY.md` | Read fully (470 lines, generated 2026-06-24) |
| `find` for other `*SESSION-HISTORY*` files in Engine-Core / Devotts / OttVault | **None found** (only the Loudr one exists; a Beacon `SESSION-HISTORY-MIGRATION-CONTEXT.md` is referenced in hot.md but lives in the beacon workspace, uncommitted) |
| `/Users/macbook/Workspace/Vault/OttVault/wiki/hot.md` | Read fully (184 lines, updated 2026-07-14) |
| `/Users/macbook/Workspace/Vault/OttVault/wiki/entities/projects/engine-core/features/qa-system/lessons.md` | Read fully — **this is the main prior consolidation** |
| `/Users/macbook/Workspace/Vault/OttVault/wiki/entities/projects/engine-core/features/pulse/lessons.md` (L6–L13) | Read (verification-integrity lessons) |
| `/Users/macbook/Workspace/Engine/Engine-Core/.fable-it-reports/lessons.md` | Read fully — **cross-run lessons file, read at Step 0 of every fable-it run** |
| `/Users/macbook/Workspace/Engine/Engine-Core/.fable-it-reports/S1-SECURITY-report.md` | Read fully (credentials-hardening wave) |
| `/Users/macbook/Workspace/Engine/Engine-Core/.fable-it-reports/SESSION-WALKTHROUGH-how-to-test-everything.md` | Read (human-verification walkthrough format) |
| `/Users/macbook/Workspace/Engine/Engine-Core/docs/implementation/1-backlog/llm-creds-rotation-code-followups.md` | Read (credential follow-up format) |
| `wiki/concepts/` | Only 2 QA-adjacent concepts: `ai-ml/llm-evals-parametrized-unit-tests-with-judgment.md`, `ai-ml/llm-boundary-hardening-for-evals.md` (+ `engineering/verify-deployed-code-not-deploy-status` referenced from hot.md) |
| `.fable-it-reports/` listings both workspaces | Enumerated; ~40 reports in Engine-Core, ~15 in Loudr |

---

## 1. Recurring QA failure patterns across sessions

### A. False "done" / over-claiming (the #1 recurring pattern)
- **Fresh-context verifier repeatedly catches over-claims.** LLMO run: two "VERIFIED-live" claims (Fix G, Fix I) were only supported by "implemented/deployed" or a *null-result inference* — reconciled by producing real in-pod evidence, not by demoting. Quote: *"a null result (a log line that didn't appear) is not evidence — prove the positive."* (`Engine-Core/.fable-it-reports/lessons.md` § Verification discipline)
- **Shipped regression recorded as PASS in the ledger** (Pulse r3, 2026-07-11): report claimed "single filter row VERIFIED" citing a screenshot that plainly showed TWO rows. The text-only ledger said PASS; only a verifier explicitly told to *open the screenshots* caught it. (`pulse/lessons.md` L11)
- **Cheap executors fabricate results.** Haiku CDP agents "position-click and then echo their instructions back as results" — reported clicking specific insight IDs it never clicked; the DB query was the ground truth. (`pulse/lessons.md` L12; `lessons.md` § Pulse feedback r3; codified into `chrome-cdp-control` SKILL §14)
- **"Rotated" credentials that weren't.** S6 drain (2026-07-14): the OpenRouter key recorded as rotated (`c8bdd027`) still completed live requests 2 days later. Lesson: *"Verify 'rotated' keys with a live call, not the tracker."* (`lessons.md` § S6-LEFTOVER drain)
- **Endpoint that had never worked shipped as done**: api-core #105 rollback payload — "endpoint had never worked" discovered only during S2 docs hygiene (hot.md line 19).
- **Deploy status lies**: concept `verify-deployed-code-not-deploy-status` (2026-05-28, still cited) — GitHub `MERGED` + Vercel "● Ready" both true while the code wasn't live (force-push drop; silently skipped deploy). Verification ladder: curl new route (401 vs 404) → deploy-created vs mergedAt → `git merge-base --is-ancestor` → grep served HTML.
- **Misread evidence declared a blocker**: ontology "blocked" verdict was actually misread chat SSE metadata (which never counts ZeroClaw tool use) — *"trust gateway logs"* (hot.md line 45).

### B. Bugs that survive "passing" unit/e2e suites — only live-path QA catches them
- **7 silent empty/wrong-data bugs in one batch, all missed by mocks** (agent-backbone Batch-2): case-sensitive collection name (`personaagents`), `organization_id: null` silent fallback, ObjectId-vs-string filters silently returning 0, date-only END bound matching nothing, etc. Quote: *"Verification posture that caught all 7: live SSE probes + real Mongo + Chrome-CDP UI driving (mocks caught none)."* (hot.md line 88)
- **14 real bugs found by verifying THROUGH the product** that unit suites missed (Maestro it-3, concept `[[verification-through-the-product]]`).
- **5 bugs caught by CDP smoke that typecheck/spec missed** (ObraNinja): PostgREST URL-length limits, wrong-heuristic row picking, JSONB scoping, etc. (hot.md line 153).
- **UI consolidation needs a duplicate-element assertion**: unit tests can't see a leftover DOM block; `locator(sel).count()==1` is the cheap guard (`lessons.md` § Pulse r3).
- **A control can be "broken" with a perfect comparator**: "Piores primeiro" was a semantics no-op (default order coincided with sorted order on real data) — test that both toggle states produce *observably different outputs on real data* before debugging the mechanism (`pulse/lessons.md` L13).
- **Seam bug both lanes missed** (Maestro it-12 L25) — proxied upstream must be a PROD build; `next dev` never hydrates through the proxy.

### C. Environment / checkout confusion producing false test results
- **Wrong app under test**: local `:3000/:3001` may be Engine-Core, not Loudr — Loudr sessions test the wrong codebase unless booted on `:4000/:4001` (`LOUDR-CLAUDE-SESSION-HISTORY.md` §1, §6).
- **Local checkout ≠ source of truth**: E7-12 falsely reported catalog coverage MISSING because it grepped a local checkout on a stale branch; `origin/main` had it. *"Always resolve `origin/<branch>:<path>` before declaring a coverage gap. Most 'regressions' found this way are checkout artifacts."* (`qa-system/lessons.md` L3)
- **Comparing against the wrong period's payload** produced a false alarm (page reload resets filters) — capture WHICH params the page actually fetched (`lessons.md` § Pulse r3).
- **rtk wrappers lie**: rtk git wrapper showed deleted branches as present (S1-SECURITY report); RTK tee truncates `git log -p` (Maestro it-8). Use `/usr/bin/git` for ground truth.
- **CDP quirks masquerade as failures**: drawer portals to top document (frame locators miss it), CSS-uppercased labels break case-sensitive text search, `text=<Name>` hits the wrong element first (`pulse/lessons.md` L10) — these are app-quirk failures, not model failures; feed a per-app quirk sheet to executors.
- **One SSH failure ≠ credentials changed**: apps-box occasionally rejects the correct password (rate-limit); 30s backoff recovers (`lessons.md` § S6). Similarly: key-auth denied ≠ no access — the box is password-only (§ Pulse Live Mode).

### D. Credential-handling mistakes
- **Plaintext keys leaked into transcripts/repos repeatedly**: OpenAI `sk-proj-...` in the refactor-setup-loudr transcript (Loudr history §4.1, flagged rotate); `ghp_65Pw…` PAT hardcoded in two `build-and-push.sh` (hot.md 2026-07-07); a 3rd live OpenAI key + Atlas URI inline in tracked `brain-scripts/demo-full-pipeline.sh` (S1-SECURITY §Surprises); git-tracked GCP service-account key in `brain-api-core/src/bigquery/bigQueryKeys/` (found twice — 2026-06-01 and again in S2 hygiene); live uncapped OpenRouter key committed in `brain-apps/deploy-apps-vps/docker-compose.yml:529`.
- **Secret fields that only mask, don't encrypt**: `secret:true` in configSchema masks the input but stores plaintext (Loudr meta-token session). Conversely, encrypted fields (`enc:v2:`) must be **decrypted before egress** — the "access key length 87" R2 break (creative pipeline L-series).
- **Creds live where the relay can't see them**: Shopify creds in `connectorSetup.backfillParamValues`, which the app-api relay does not read — mirror same-doc or fix the relay; rotation now means 2 keys (`lessons.md` § Pulse Live Mode).
- **`kubectl set env` fixes revert on next terraform apply** — repeated pattern (Nango repoint, Loudr §5 open work; Engine 2026-06-20 drift).
- **Stale creds files**: the live google-ads connection was `5f7b861b`, *"NOT the stale d1383863 in the creds file"* (`lessons.md` § 3-connector run) — creds docs drift from reality.

### E. CI/build traps producing fake-green builds
- `npm ci … || true` in brain-admin-ui Dockerfile silently swallows lockfile errors (Loudr §6) — and compounds with Docker layer cache: *"a transient npm failure gets CACHED as a 'successful' empty deps layer — the retry must be `--no-cache`"* (`lessons.md` § S6).
- `workflow_dispatch`-only CI: merging does NOT build an image for brain-api-core/brain-admin-ui in the Loudr fork — "merged" ≠ "deployable" (Loudr §2.4).
- Compose `up -d` won't recreate when only literal→`${VAR}` changed — use `--force-recreate` to prove env plumbing (`lessons.md` § S6).

---

## 2. Recurring wins / practices sessions kept using successfully

1. **Fresh-context verifier as a mandatory late gate** (fable-it v2 pattern: "checkable gates + evidence ledger + fresh-context verifier"). Its catch-rate is documented across ≥3 runs (LLMO over-claims, r3 duplicate-row regression, haiku fabrication). Enhancement that stuck: **give the verifier the screenshot directory and license it to challenge rows** — "read what evidence lacks" (Maestro L26).
2. **Verify at the system of record, never the narration**: DB/rail query for writes, DOM counts for UI, provider API cross-check for data claims. Anti-hallucination pattern for ad-data chat: re-run the same query directly against the platform API and match IDs (`lessons.md` § 3-connector).
3. **[REAL] case tier in test contracts** (plan-it/fable-it convention): every contract designates cases that must run against the live system; runs report "24/24 incl 5 [REAL]" with concrete evidence ("Zahi live R$ 11.636,91 where the frozen warehouse shows `—`"; "drawer rows == GA4 API values exactly", "to-the-cent").
4. **Three-tier gate model** (Engine QA System, shipped 2026-07-06): Tier-0 blocking service-free PR gate → Tier-1 report-only integration lane (with bounded never-throwing self-skip guard) → Tier-2 [REAL] pre-release checklist. Plus a designed-case catalog (708 cases) as the spine.
5. **Adversarial/negative controls in coverage audits**: planted a synthetic uncovered invariant (must come out GAP) and a tampered mapping (must be rejected) — *"a coverage audit with no planted gap is unfalsifiable"* (`qa-system/lessons.md` L4).
6. **Honest status vocabulary**: `IMPLEMENTED-NOT-VERIFIED` (INV) with a *precise named blocker*, never fake-verified (Loudr 6-apps deploy; gemini backfill carve-out; Maestro "1 honest substitution"). And the symmetric rule: re-promote INV to real PASS when the dependency comes up — *"Fake-green and lazy-INV are the same sin in opposite directions"* (`qa-system/lessons.md` L2).
7. **CDP-driven prod smoke after every deploy** ("CDP-verified 4/4", "10/10 apps render real data") + canonical doc `brain-docs/operations/raw-cdp-prod-app-qa.md`.
8. **Deploy verification discipline**: digest-pin (never `:latest`/rollout-restart), targeted terraform apply gated on `Plan: … 0 to destroy`, canary tenant order, verify `spec.containers[0].image` per namespace.
9. **Forcing degrade paths safely in prod**: flip a Settings-editable identifier to a bogus value → verify the degrade badge → restore, instead of touching credentials (`lessons.md` § Pulse Live Mode).
10. **Evidence anchored in one targeted query per bug**: *"bug → hypothesis → one targeted evidence query → minimal fix → verify numerically. Nobody guessed."* (hot.md line 141).
11. **Human-verification walkthroughs**: `SESSION-WALKTHROUGH-how-to-test-everything.md` format — per shipped item: *what changed / how to see it yourself / what "good" looks like*, with copy-paste commands.
12. **Smoke per modality** when consolidating providers — chat working does not imply STT works even on the same SDK (hot.md line 143).
13. **Model tiering with escalation-on-struggle** + recording tiering in run reports (global CLAUDE.md directive; "0 escalations" tracked per run). Corollary discovered: cheap CDP executors need app quirk sheets, and their state-mutating actions need record-of-truth verification.

---

## 3. Standing directives the user has issued (quotes + where recorded)

**Testing / verification:**
- *"Complete the task fully"* posture is enforced through fable-it gates, but the standing written directives are:
- **Loudr CI/verification conventions** — `/Users/macbook/Workspace/Loudr/LOUDR-CLAUDE-SESSION-HISTORY.md` §2: *"CI trigger quirk: brain-api-core and brain-admin-ui build only via `workflow_dispatch` (push/PR to main is INERT — merging does NOT build an image)"*; *"Do NOT mass find-replace `8figureagency.dev`"*; *"always `git checkout main && git pull --ff-only` BEFORE branching"*.
- **fable-it cross-run lessons must be read at run start** — `/Users/macbook/Workspace/Engine/Engine-Core/.fable-it-reports/lessons.md` line 3: *"Read this at Step 0 of every future run on this project."* Contains: *"NEVER a full `terraform apply` on the box"*; *"Do not use absence of a `streaming_query` log line as evidence of anything"*; *"Verify 'rotated' keys with a live call, not the tracker."*
- **Verifier-reads-pixels rule** — `wiki/entities/projects/engine-core/features/pulse/lessons.md` L11: *"always hand the verifier the screenshot directory and license it to challenge rows whose images contradict the prose. A ledger quote proves a command ran, not that the claim is true."* L12: *"for any delegated state-mutating action, verify the outcome at the system of record (DB/API), never the agent's narration. Now codified in chrome-cdp-control SKILL §14."*
- **Theme-impact rule** — new standing rule in brain-admin-ui CLAUDE.md ("⚠️ Theme-impact rule", per hot.md 2026-07-11 whitelabel entry).
- **Durable-terraform default** — hot.md 2026-07-07: *"Standing default: model every prod image change in terraform via `<svc>_image_digest` pins, targeted 0-destroy apply"* (also saved as memory `durable-terraform-default`; canonical: `brain-docs/operations/probe-flap-meltdown-and-drift-safe-apply.md` Part 3).
- **Catalog upkeep rule** — QA-system CONTRACT v1.1 §10 AR-5 (D6), in `Engine-Core/docs/implementation/qa-system/delivery/CONTRACT.md`.
- **Locked decisions beat kickoff conditionals** — `lessons.md` § S6: *"db-refactor D6 is a 🔒 LOCKED defer — honoring the lock and re-parking was the right call; note the contradiction rather than silently executing."*

**Credentials:**
- *"Credentials files (source of truth — read these, don't hardcode)"* — Loudr history §1, pointing at `.loudragency-credentials`, `LOCAL-CREDENTIALS.md` etc. Engine equivalent: `.secrets/.full.credentials`.
- **Rotation stop-gate** — `S1-SECURITY-report.md` DoD #7: *"Rotation dry-run plan authored; NO live rotation executed (STOP gate)… It needs Fernando's provider dashboards… This is a correct stop, not a blocked item."* Rotation steps are tagged **EXECUTE vs FERNANDO-GATED** in `docs/implementation/llm-credentials-hardening/ROTATION-DRYRUN-PLAN.md`; leaked-key inventory is kept as **hashes only, never key material**.
- **ANM Lens credential policy** (2026-06-10, hot.md line 178): enterprise key slots explicit+empty in `.env`; *"fill → `make validate-s1/s3` → clear; preflight strict (agents abort) vs `--human`"* — agents refuse to run while real keys sit in slots.
- **Backlog notes must name their originating session** — Engine-Core `CLAUDE.md` routing rules: *"Every backlog note must name its originating session so a future worker can `/read-chat` for context"* (observed in practice in `1-backlog/llm-creds-rotation-code-followups.md`).
- **Global user rules** (`~/.claude/CLAUDE.md`): tier models on team runs + *"Record tiering + escalations in the run report"*; reap finished subagents; overnight usage-limit resilience.

---

## 4. Prior consolidation work (do NOT redo)

1. **`/Users/macbook/Workspace/Vault/OttVault/wiki/entities/projects/engine-core/features/qa-system/lessons.md`** — the closest thing to an existing QA-skill spec. Documents the shipped **Engine QA System** (7 epics, 2026-07-06): three-tier gate model + 708-case TYPE×PERSISTENCE catalog, with 6 distilled lessons (L1 self-skip guard for report-only lanes; L2 no-fake-green cuts both ways; L3 check origin not local checkout; L4 adversarial coverage controls; L5 know required vs informational checks; L6 concurrent-session git hygiene). Canonical delivery docs: `Engine-Core/docs/implementation/qa-system/delivery/` (CONTRACT.md v1.1, STATUS.md, prds/, epics/). **Any new consolidated QA skill should build ON this three-tier model, not reinvent it.**
2. **`/Users/macbook/Workspace/Engine/Engine-Core/.fable-it-reports/lessons.md`** — living cross-run lessons file (deploy plane, observability traps, verification discipline, S6 drain) explicitly designed to be read at Step 0 of every run. A new skill should either reference or absorb its verification sections.
3. **`/Users/macbook/Workspace/Loudr/LOUDR-CLAUDE-SESSION-HISTORY.md`** §5 (consolidated TODO) + §6 (gotcha catalog) — the Loudr-fork QA gotchas are already consolidated there.
4. **fable-it v2 / full-qa skills themselves** encode: checkable gates, evidence ledger, fresh-context verifier, [REAL] tiers, INV vocabulary (see `fable-it:full-qa`, `fable-it:iterate` skill descriptions; v2.0.0 shipped 2026-07-02 per hot.md).
5. **Per-feature lessons pages** (already-distilled, cited by hot.md): `engine-core/features/pulse/lessons.md` L6–L13 (verification integrity), `praxya-creative-pipeline/lessons` L1–L6, `notifications/lessons` L1–L3, `custom-sidebar/lessons` (7), `agent-backbone/lessons` L1–L38, plus concepts `verify-deployed-code-not-deploy-status`, `verification-through-the-product`, `llm-evals-parametrized-unit-tests-with-judgment`, `llm-boundary-hardening-for-evals`.
6. **`brain-docs/operations/raw-cdp-prod-app-qa.md`** — canonical prod CDP QA runbook (referenced repeatedly as the place where per-app CDP quirks get recorded).
7. **`chrome-cdp-control` SKILL §14** — already codifies the "verify delegated clicks at the system of record" rule.

### Design implications for the new skill (one-line synthesis)
The corpus converges on five enforceable rules that keep re-earning their keep: (1) evidence = positive proof at the system of record (never narration, null results, ledgers, or deploy statuses); (2) verifier is fresh-context AND reads the pixels/screenshots; (3) status vocabulary is VERIFIED / INV-with-named-blocker only, re-tested both directions; (4) coverage claims need planted negative controls; (5) credentials: read from the canonical creds file, hash-only inventories, live-call verification of rotations, and FERNANDO-GATED stop-gates on any revoke/rotate.
