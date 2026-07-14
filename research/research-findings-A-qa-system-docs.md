<!-- Research finding for the new test-it/review-it/qa-it skill. Source: subagent report, session 'review-it-skill-plan' (Engine-Core cwd, 8fai subscription), 2026-07-14. Study of docs/implementation/0-done/qa-system (Engine-Core) -->

# QA-System Package — Extraction Report for `test-it`/`review-it`/`qa-it` Skill Design

Source package: `/Users/macbook/Workspace/Engine/Engine-Core/docs/implementation/0-done/qa-system/` (files: `01-current-state-and-findings.md`, `02-qa-architecture-and-contract.md`, `03-roadmap-and-decisions.md`, `delivery/{CONTRACT.md,00-program-plan.md,README.md,STATUS.md,KICKOFF.md,FABLE-IT-LAUNCH-PROMPT.txt,NEXT-SESSION-PROMPT.txt,prds/*,epics/*}`, `research/{SHARED-CONTEXT.md,A-palantir-harvest.md,B-praxya-harvest.md,C-repo-ci-audit.md}`).

---

## 1. What the QA system is

**Mission** (`delivery/CONTRACT.md` §1): make 708 already-designed test cases (162 palantir + 362 praxya + 184 db-refactor) "run at the right moments" so a multi-repo app stops breaking as it grows. Core insight: **don't invent tests — harvest what implementation projects already designed as binding Test Contracts, consolidate into a durable catalog, and wire the gates that actually execute them** (`01-current-state-and-findings.md` §1).

### Architecture — two independent axes (`02-qa-architecture-and-contract.md` §1)
Every test case is classified on **two axes simultaneously**, not one:
- **Axis 1 — TYPE** (what it checks): `unit · e2e · golden-value · adversarial (inverse-op) · grep-proof (static) · [REAL] (live prod/tenant)`. A db-refactor "shape" overlay adds `idempotency · rollback/safety` for data-migration work, carried as an addition not a replacement.
- **Axis 2 — PERSISTENCE** (how it keeps running): `CI-persisted (every PR) · script-persisted (committed re-runnable executable) · harness-primitive (reusable lib) · one-time-live (ran once via SSH/kubectl, needs re-automation) · parked (deferred, e.g. safety-ladder soak)`.

Rationale (CONTRACT §1, 02 §1): TYPE tells you *what a regression breaks*; PERSISTENCE tells you *whether anything catches it tomorrow*. A cheap deterministic invariant that's only "one-time-live" is a silent gap; the same invariant CI-persisted is real protection. **This is the single most generalizable idea in the whole package** — a QA skill could ask of every test case "what does it check?" AND "will anything ever run it again?" as two separate questions.

### Gate tiering model (`02` §2, `CONTRACT.md` §4)
Three tiers, one hard rule: **"a case blocks a PR only if it is deterministic and service-free."**
- **Tier 0 — PR gate** (blocking, fast, no live services): unit tests, grep-proof static invariants, typecheck/lint, and integration tests that *self-skip* when services are absent.
- **Tier 1 — Integration/e2e lane** (blocking-on-merge, service-backed via containers): starts **report-only** (never fails the merge check via `continue-on-error: true`), promoted to blocking only after an objective bar is met (see §2 below).
- **Tier 2 — `[REAL]` pre-release/scheduled checklist** (never blocks a PR): hits live prod/tenants; can't be faked. A `[REAL]` case on an unreachable target is **IMPLEMENTED-NOT-VERIFIED, never fake-green** — this is treated as a first-class status, not a failure mode.

### Deploy-time gate (the fourth leg — `02` §4, decision D4)
Rather than force a uniform CI gate onto every repo (some — e.g. `brain-apps`, 24 sub-apps/3 test runners/9 with none — were judged not worth PR-gating), the QA system instead enhanced the **deploy skill itself** (`/engine-deploy`) with a pre-merge/rollout test-execution step that runs each affected repo's Tier-0 suite and blocks fail-closed on red — covering every repo *regardless of whether it has a PR-CI gate*. This is the "catch it at ship time even if nothing catches it at PR time" backstop.

### The standing regression catalog (`02` §3, epic E1)
One markdown file, `brain-docs/qa/regression-catalog.md`: one row per case (`case_id | source | repo | TYPE | PERSISTENCE | invariant | expected outcome | current location | tier`), an **invariant index** (~50/29-canon named invariants → guarding case_ids → gate tier), an **accepted-gap register** (invariants with zero guarding cases, explicitly registered so they're never mistaken for "covered"), and a rule that **CONTRACT-corrected values are law** over stale source-file literals.

---

## 2. Key decisions + rationale

All locked decisions live in `03-roadmap-and-decisions.md` §5 and `CONTRACT.md` §10 (owner: Fernando, dated 2026-07-05/06).

| Decision | Choice | Rationale |
|---|---|---|
| **D1** | Scheduled QA jobs (weekly restore-drill, weekly registry-reconcile, daily TTL-presence probe) → **DEFERRED, not built** | Each maps to a real observed failure (981k-doc stray-db pile, 12-day install-state drift, silent `ttlMonitorEnabled` reset) but was out of this run's scope — documented as the top future-run candidate, not lost |
| **D2** | Tier-1 integration/e2e lane → **author epics, Wave-2, report-only first**, promote to blocking once stable | Live-service tests are flaky/slow; report-only lets them prove themselves before they can block anyone |
| **D3** | CI runner strategy → **per-repo workflows**, copy the brain-agent/brain-connectors pattern; **no shared cross-repo composite action pursued** | No root package.json/turbo/Makefile existed; nothing to tear out, simplest to extend what's already proven |
| **D4** | `brain-apps` (hardest gate: 24 sub-apps, 3 runners — vitest/tsx/jest —, 9 with zero test script) → **no PR gate at all**; deploy-time gate is its *only* protection | Forcing a uniform runner or a PR matrix was judged not worth it; "meet each app where it is," covered at ship time instead |
| **D5–D7** | Catalog = plain markdown (not DB/JSON) in `brain-docs/qa/`; upkeep = a **process rule**, not automation; encode CONTRACT-corrected values + register 2 accepted gaps | No automation appetite (explicit G2 lock); a markdown catalog is legible and diff-reviewable |
| **Gate rule §4.3** | Wire **only test scripts that exist** | Dead scripts (`test:e2e`, `test:integration` pointing at missing dirs/configs) would silently no-op a gate — it'd report green while running nothing |
| **Gate rule §4.4** | **Extend-never-clobber** — every gate epic re-reads the target repo's LIVE `.github/workflows/` first and adds a sibling job, never replaces an existing one | CI reality moved *during planning* (db-refactor merged new CI checks the same day this was audited) — binding to a snapshot is unsafe; must bind to live state at build time |
| **Gate rule §4.5** | Deploy-time gate is **fail-closed** with a 3-way outcome taxonomy: PASS / SKIP (no test script, log "no tests — proceeding") / SKIP (out of scope, log the scope reason) — never a silent bare pass | Distinguishes "nothing to run" from "something ran and passed" from "something ran and failed" so a gap never masquerades as coverage |
| **Test-pyramid split** | Fast-deterministic (unit + grep-proof) always blocks; integration/e2e/`[REAL]` never blocks a PR directly | "Everything blocking = slow flaky PRs. Nothing blocking = no protection." (`01` §4.1) |
| **First-slice strategy** | Prove the whole catalog→gate→block loop on the *simplest* gap repo first (`master-admin`: 16 specs, single package, zero CI) before fanning out to harder repos | Cheap end-to-end validation before scaling — catalog its cases → wire the gate → open a PR that deliberately breaks a spec → confirm gate fails → fix → green |
| **Model tiering** | Mechanical YAML-copying (gate wiring) → haiku; judgment-requiring writing (catalog, deploy-gate enhancement, integration lane) → sonnet; adversarial coverage verification (crown-jewel reasoning) → fable/opus-tier; coordinator stays top-tier and escalates any struggling lower-tier slice | Match cost to difficulty; a haiku agent wiring a gate to a dead script or clobbering an existing job gets re-run on a higher tier, not silently accepted |

### Testing-methodology invariants (`CONTRACT.md` §5, sourced from a prior db-refactor program) — directly portable to a QA skill
1. **Fake-green discipline**: a `[REAL]`/live-target case that's unreachable is reported **IMPLEMENTED-NOT-VERIFIED**, never asserted PASS. This status is load-bearing throughout the whole package — dozens of cases in the delivered epics carry it honestly rather than being faked green.
2. **Live-drift-aware golden asserts**: on actively-written stores, partition assertions by a cutover timestamp; never assume a destination is empty/static (a real incident: an `auditlogs` collection grew 201,021 rows *during* a migration, breaking a naive count-equality assert).
3. **Auth tests over Service DNS, never `kubectl exec` localhost** — Postgres `pg_hba trust` accepts any password from the same pod, producing false-positive "auth works" results.
4. **Grep is not proof of deadness** — implicit ORM pluralization (Mongoose) can recreate a "dead" collection with zero literal string references in code; a 0-hit grep is not proof.
5. **Code-grep needs a DB-access-syntax filter** (`db[`, `.getCollection(`, `InjectModel(`), not substring match — a naive substring search for a common word like `roles` produced 442 hits, 441 noise.
6. **Safety ladder for destructive ops**: `backup → code_grep → soft_delete → soak≥14d → hard_delete → verify` — a destructive check that can't prove reversibility does not ship.

---

## 3. What was actually delivered vs. planned

Source: `delivery/STATUS.md` (final state 2026-07-06) + per-epic "Build result" sections.

**All 7 epics shipped, 83 binding meta-QA test cases, 100% of epics reached the honest-closed bar:**

| Epic | Scope | Cases | Status | Notable outcome |
|---|---|---|---|---|
| E1 — regression-catalog | 708-case two-axis catalog + invariant index + gap register | 12 | SHIPPED | Landed on `brain-docs` `origin/main` |
| E7 — qa-contract-coverage | Adversarial re-derivation of invariant→case coverage from source corpora (not just re-trusting the harvest's own index) | 12 | SHIPPED | **29/29 canon invariants confirmed covered**; gap set confirmed exactly {praxya §11.6, §11.5}; folded D6 catalog-upkeep rule into CONTRACT v1.1 |
| E2 — brain-api-core test gate | `test` job (393 specs) beside existing `lint` job | 12 | SHIPPED | PR #81; db-refactor `lint` job preserved |
| E3 — master-admin test gate (first slice) | First-ever CI gate, 16 specs | 11 | SHIPPED | Proved the catalog→gate→block loop end-to-end |
| E4 — processor test gate | `test:unit` only (3 specs) — explicitly not the dead `test:integration`/`test:e2e` scripts | 10 | SHIPPED | |
| E5 — engine-deploy test gate | New `## 1.7 Pre-deploy test gate` section in the deploy skill | 14 | SHIPPED | Extend-only diff verified; +3 prior gotchas and attribution footer preserved byte-identical |
| E6 — integration lane (brain-api-core, Tier-1) | Repaired dead `test:e2e` config, added self-skip guards, new report-only CI job | 12 | SHIPPED | PR #82 → `b01aa73`. **8/12 cases actually PASSED live** (Docker was available this session — the plan's own "no-fake-green cuts both ways" principle: pre-marked IMPLEMENTED-NOT-VERIFIED cases were run for real when the blocker turned out not to apply) |

**Real bugs and structural facts surfaced during the build** (not part of the plan, found by executing it):
- E6's report-only e2e lane surfaced a genuine pre-existing DI bug on `brain-api-core` main (`graph.service.ts:44-46` — optional constructor params missing NestJS `@Optional()`, causing 3/3 test failures in one spec) — confirmed pre-existing (0 diff on `main`), previously unobservable simply because the e2e harness had never been runnable. Filed as a separate follow-up, correctly kept out of the QA-harness epic's own scope.
- Two Test Contract cases (TC-8/TC-9 in E6) were correctly left **IMPLEMENTED-NOT-VERIFIED** because the target repo was a private GitHub repo without a paid tier, so branch-protection/rulesets APIs returned 403 — a genuinely unreachable verification target, reported honestly rather than assumed.
- **Follow-ups explicitly handed off, out of scope**: the DI bug fix (separate PR), and TTL-presence graduating from a single one-time-live case to a real scheduled probe (deferred, D1).

---

## 4. Reusable / generalizable pieces vs. Engine-Core-specific

### Highly generalizable (candidate skill primitives)
- **The two-axis classification model (TYPE × PERSISTENCE)** — this is domain-agnostic and is the strongest single idea to port. A `test-it`/`qa-it` skill could ask, for any test/check it encounters or writes: what does it verify, and will anything rerun it tomorrow (CI / scheduled script / manual checklist / never)?
- **The three-tier gate model** (deterministic-and-service-free blocks PR; service-backed reports-only until proven stable; live-target never blocks, checklist/scheduled only) — a clean, reusable policy for "what belongs on a PR gate vs. not."
- **Extend-never-clobber discipline**: re-read the live CI/workflow file at build time (not a stale audit snapshot) before adding a gate; diff-audit the change to prove only additions were made. Directly portable as a "before touching CI, read what's actually there" step.
- **"Wire only what exists" rule**: never point a new gate at a test script/config that's dead or missing (found repeatedly: `test:e2e`/`test:integration` pointing at directories/files that don't exist across 3 different repos) — a mechanical pre-check ("does this script/dir actually exist and run?") worth baking into any gate-wiring skill logic.
- **Fake-green / IMPLEMENTED-NOT-VERIFIED status discipline** — a named, first-class non-boolean test outcome for "this genuinely cannot be verified right now (unreachable live target, no admin access, no live service)" as distinct from both PASS and FAIL. This is possibly the single most portable governance idea: it prevents a QA skill from ever being pressured into reporting green on something it didn't actually run.
- **Adversarial self-check / inverse-op discipline**: every gate-wiring epic required proof that a *deliberately broken* case actually makes the gate fail (not just that a passing case makes it pass) — "if you claim a gate blocks red, prove it by breaking something and watching it block." Also applied recursively to the coverage-verification epic itself via synthetic/tampered controls (a planted zero-coverage invariant must be flagged, a fabricated case_id must be rejected) — i.e., verify the verifier.
- **The 6 methodology invariants (§2 above)** — these are generic testing-discipline lessons (live-drift-aware asserts, DNS-not-localhost auth tests, grep-is-not-proof-of-deadness, code-grep needs syntax filters, safety ladder for destructive ops) independent of this codebase; worth encoding as default guidance in any QA skill that touches infra/DB testing.
- **Test Contract format itself**: binding, numbered, type-tagged cases with a registered *expected output* written before the build starts (never back-filled), DoD = 100% pass or explicit IMPLEMENTED-NOT-VERIFIED with a precise blocker. This "Specification by Example" discipline (case_id | type | setup | expected output | assertion) is the atomic unit the whole package is built from and generalizes cleanly to any project.
- **"Ground moves under the plan" lesson**: CI/repo state can change mid-planning; any QA tooling must bind to live state, not a cached audit, at execution time.
- **Skip taxonomy discipline** (PASS / SKIP-no-script / SKIP-out-of-scope / BLOCK, never a silent bare pass) — reusable pattern for any coverage-gap-tolerant gate.
- **Regression-priority/blast-radius ranking** (`A-palantir-harvest.md` §4, `B-praxya-harvest.md` §4): a repeatable heuristic for ranking which invariants are highest-value-per-test-second — fail-closed security inverse-ops and grep-proof static checks rank highest (cheap, deterministic, catch silent reintroduction during refactors); money/data-integrity goldens rank next; live-prod `[REAL]` checks rank for "is the golden path actually true" but never gate.

### Engine-Core / brain-app specific (do not port verbatim)
- All concrete invariant names (FCS, SPI, SVK, IDEM, CGK, AI-never-invents-a-number, money-in-cents, reach-never-summed, etc.) and the specific 708-case corpus — these are this app's regression contract, not a generic pattern.
- Repo names, specific file paths (`docker-build.yml`, `jest-e2e.json`, `sidebar.e2e.spec.ts:26-27` hardcoded Redis port 6390), and the `/engine-deploy` skill integration — codebase-specific plumbing, though the *pattern* (add a deploy-time test gate as a backstop for repos without PR-CI) is portable.
- The `brain-docs/qa/regression-catalog.md` location and squad/wave/branch-naming conventions (`epic/qa-<EID>-<slug>`) — Engine-Core's own delivery-process conventions (plan-it/fable-it), not intrinsic to QA methodology.
- The specific harvest sources (palantir-ontology, full-praxya, db-refactor implementation packages) — this system's whole premise was "harvest what two prior *specific* implementations already designed," which won't apply the same way to a fresh portable skill (there's no equivalent pre-existing corpus to harvest for a new project, unless the skill's job is precisely to *do* that harvesting whenever a new implementation lands — which is itself a generalizable idea: mine a project's own historical implementation/PRD packages for already-written test scenarios instead of designing from scratch).

---

## 5. Known gaps / lessons

- **Accepted gaps, registered not hidden**: two invariants have zero test coverage across all 708 cases — praxya CONTRACT §11.6 (timeline/interaction mirroring, an amendment that postdated all Test Contracts, 0/362 cases) and §11.5 (space_id==tenant-slug, only indirectly touched by one unrelated case). The package's answer wasn't to fake coverage or ignore them — it registered them explicitly in an "Accepted Gaps" section with a trigger ("add cases when this ships"). **Lesson for a portable skill**: a CONTRACT/spec amendment that binds new behavior after Test Contracts were already frozen is a structural risk (`CONTRACT.md` §10 AR-5 folds this into a binding rule: *any future amendment must either cite a guarding case or register an accepted gap at amendment time*).
- **"Covered-thin" register** (`CONTRACT.md` §10 AR-2) — five invariants are technically covered but fragile: single-case coverage, one-time-live persistence only, or `[REAL]`-only tier with no deterministic Tier-0/1 guard (TTL-presence, batch-AI-nightly, one-DB-per-tenant persistence, accent-insensitivity, and the code-grep DB-syntax-filter tooling itself, which is "encoded as discipline but the automation isn't built"). This is a useful intermediate state between COVERED and GAP worth encoding in a skill's vocabulary.
- **Deferred entirely (D1)**: scheduled QA jobs (weekly restore-drill, weekly registry-drift reconcile, daily TTL-presence probe) — each maps to a real historical incident but was consciously scoped out to keep this run's blast radius small. Documented as the explicit next-run candidate rather than silently dropped.
- **Dead test scripts everywhere** — a recurring, cross-repo failure mode: `test:e2e`/`test:integration` npm scripts pointing at directories or config files that simply don't exist (found independently in `brain-api-core`, `brain-connectors`, and `processor`). A naive gate wiring script to these "as-is" would report green while running nothing. This is one of the most concrete, checkable lessons for a QA skill: **verify the target of any script/command actually exists and is runnable before wiring a gate to it.**
- **E6's honest partial closure**: 4 of 12 Test Contract cases were verifiable only by static inspection at build time; the other 8 needed a live Mongo/Redis session, a real PR run through GitHub Actions, or repo-admin settings access the build session didn't have — each was marked IMPLEMENTED-NOT-VERIFIED with its *precise* blocker rather than glossed over, and TC-9 in particular became a **permanent** blocker (private repo without GitHub Pro/Team tier → branch-protection API returns 403) rather than a transient one — worth distinguishing "temporarily unreachable" from "structurally unreachable" in a skill's status vocabulary.
- **CI-state drift during planning itself** (F-1a): a prior program (db-refactor) merged new CI checks into `brain-api-core` on the *same day* this QA system's audit ran, partially invalidating the audit's findings before the plan was even frozen — the explicit lesson baked into the CONTRACT was "bind gates to the live workflow file at build time, never to an audit snapshot."
- **Count-reconciliation discipline caught real errors**: multiple harvest documents had a prose summary line that didn't match their own countable table rows (e.g. `brain-connectors`' epic said "7 unit / 6 regression" but the literal per-row tags summed to "5 unit / 7 regression"); the researchers treated the row-level table as ground truth over the prose summary and flagged the discrepancy rather than silently trusting either. **Lesson**: always recount rows independently rather than trusting a self-reported total.

---

**Key file paths for follow-up reading**:
- `docs/implementation/0-done/qa-system/delivery/CONTRACT.md` — the frozen "law," most reusable single document (vocabulary, gate rules, methodology invariants, definition-of-shipped).
- `docs/implementation/0-done/qa-system/02-qa-architecture-and-contract.md` — the two-axis/tiering architecture.
- `docs/implementation/0-done/qa-system/delivery/epics/epics-3-deploy-gate.md` and `delivery/prds/prd-3-deploy-gate.md` — the deploy-time-gate pattern (portable "backstop repos with no PR-CI" idea), with an example of extend-never-clobber diff discipline in practice.
- `docs/implementation/0-done/qa-system/delivery/prds/prd-5-contract-coverage.md` §4 — the executed adversarial coverage-verification method (worth studying for the "verify the verifier" / synthetic-control pattern).
- `docs/implementation/0-done/qa-system/research/C-repo-ci-audit.md` — a template for how to audit a codebase's actual test/CI reality (skeptic posture, cite `path:line`, correct prior assumptions with verified facts).
