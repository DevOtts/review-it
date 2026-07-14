<!-- Research finding for the new test-it/review-it/qa-it skill. Source: subagent report, session 'review-it-skill-plan' (Engine-Core cwd, 8fai subscription), 2026-07-14. Inventory of existing QA/test skills + Devotts plugin packaging -->

# QA/Testing Skills Inventory & Design Research for consolidated `test-it`/`review-it`/`qa-it`

## 1. Per-skill capability summary

**`/Users/macbook/.claude/skills/worktree-test-isolation/SKILL.md`** (+ `worktree-bootstrap.sh`, `worktree-teardown.sh`, `connect.py`, `INSTALL.md`)
- Does: gives every git worktree its own app port, ephemeral Chrome/CDP endpoint, and (optional, commented-out) DB, all behind one `.env.worktree` contract file, so N parallel Claude sessions never collide on port 3000 / the browser / the DB.
- Mechanism: `SessionStart` hook (`worktree-bootstrap.sh`) is a no-op outside a linked worktree (`git rev-parse --git-dir` vs `--git-common-dir`); allocates 3 free ports via Node, launches a headless throwaway Chrome (`--user-data-dir=$STATE_DIR/chrome`), writes `.env.worktree` + `.wt/state`. `SessionEnd` hook (`worktree-teardown.sh`) kills the Chrome PID + optional DB container. `connect.py` is a Playwright helper that reads `.env.worktree` and hands back `(pw, browser, ctx, page)`, optionally loading a saved `storageState` for auth instead of copying the real profile.
- Triggers: "test this feature", "run the e2e", "test it in the browser", parallel sessions needing a dev server + browser each.
- Good: clean separation of "model 1" (ephemeral throwaway Chrome, fully parallel) vs "model 3" (the one real logged-in Chrome at `:9222`, must serialize via `flock`); idempotent bootstrap; explicit hard-rules list (never hardcode ports, never copy the real profile, never commit generated files).
- This is the **user-skill (`~/.claude/skills/`) draft/private version**. Its packaged, public sibling is `parallel-lifecycle` (below) — nearly word-for-word the same mechanism, restructured as a full plugin with `hooks.json` wiring `${CLAUDE_PLUGIN_ROOT}` paths instead of a hand-installed `~/.claude/hooks/` copy.

**`/Users/macbook/.claude/skills/full-qa/SKILL.md`** — 389 lines
- Does: generic autonomous QA suite — ingest a test plan → preflight (service health + CDP + Playwright) → setup/seed → execute every test case (API via curl/DB, or UI via a 5-step CDP screenshot loop) → on FAIL enter a diagnose→fix→test→evaluate bug-fix cycle → exploratory-testing pass (fixed "top 3-5" from an Explore subagent) → final QA report table with a READY/NOT READY verdict.
- Triggers: `/full-qa [path-to-test-plan.md]`, before releases, after significant changes.
- Mechanism: self-contained — inlines CDP action templates, selector ladder, wait strategy, stack-specific quick-reference commands (Supabase, Next.js, NestJS, FastAPI, Django/Rails/Laravel) directly in the file.
- This is the **older/standalone version** — see overlap map below, it has been superseded by the fable-it-bundled copy.

**`/Users/macbook/Workspace/Engine/Engine-Core/.claude/skills/review-pr/SKILL.md`** — 75 lines
- Does: a static PR-review checklist scoped to the 8FA/Engine-Core stack: security (guards, DTO validation, no raw SQL interpolation, `@Exclude()`), NestJS patterns (Swagger decorators, DI, `.lean()`, exception types), Next.js patterns (route groups, SWR, `mutate()`), TypeORM patterns (migrations not auto-sync), data-integrity (Mongo+Weaviate+Memgraph sync, cascading deletes), code quality, testing coverage, documentation.
- Triggers: manual invocation when reviewing a PR for this codebase.
- Mechanism: pure checklist, no automation, no scripts, no subagent orchestration — a static reference doc, most project-specific/least reusable of the set.
- Good: dense, stack-accurate, catches real classes of bugs specific to this codebase (cross-DB sync, guard usage). Weak: no process (when/how to apply it), no severity tiers, no evidence requirement, doesn't distinguish blocking vs. nice-to-have.

**fable-it plugin bundle** — `/Users/macbook/Workspace/Devotts/fable-it/plugins/fable-it/skills/`
- **`full-qa/SKILL.md`** (319 lines) — the **newer, better version** of the standalone full-qa (full diff below).
- **`iterate/SKILL.md`** — generic diagnose→fix→test→evaluate loop (not CDP-specific), adds: adversarial "skeptic subagent" that must try to refute a root-cause hypothesis before a fix is trusted; evidence ledger writes (`.taskstate/evidence.md`); safe-parallel git-worktree isolation rule for subagents that write; cost-aware model tiering table reference; delegation gate ("idle ≠ delivered" — check subagent output exists on disk before trusting it).
- **`chrome-cdp-control/SKILL.md`** — manual, one-action-at-a-time driver for the user's REAL logged-in Chrome (`:9222`), with a mandatory per-write confirmation gate (post/send/delete/submit/follow etc.), an action log (`~/.chrome-automation-actions.log`), and a "route guard" that explicitly refuses to let autonomous QA (`/full-qa`) touch an authenticated session.
- **`references/cdp-core.md`** — the de-duplicated, single-source-of-truth CDP mechanics (endpoint resolution, action template, tab selection, selector ladder, wait strategy, failure protocol) that both `full-qa` and `chrome-cdp-control` reference rather than restate.
- **top-level `fable-it/SKILL.md`** (212 lines) — the orchestrator. Its QA-relevant machinery:
  - **Gate catalog**: turn-end, claim, state-change, phase-boundary, delegation, interlock, worktree, integration gates — each a trigger/test/action triple.
  - **Evidence ledger** (`.taskstate/evidence.md`): "VERIFIED is a lookup, not a judgment call" — a criterion may be reported VERIFIED only if the ledger holds a same-session passing tool result; otherwise it is mechanically IMPLEMENTED-NOT-VERIFIED or BLOCKED.
  - **Fresh-context verifier**: a top-tier subagent, given ONLY the DoD + draft report + evidence ledger (never the implementation conversation), CONFIRMs or CHALLENGEs every VERIFIED row; challenges must be resolved (re-verify or demote) before delivery.
  - **Verifiability precheck**: don't spawn a QA pass against an unreachable target — that manufactures a false green; route straight to IMPLEMENTED-NOT-VERIFIED with the reason.
  - **Routing table**: UI/visual work in a test env → `/full-qa`; authenticated real-Chrome → `/chrome-cdp-control`; mixed → both.
  - Delegates entirely to `/launch`, `/iterate`, `/full-qa`, `/chrome-cdp-control` — "never paste a worse copy here."

**`/Users/macbook/Workspace/Devotts/parallel-lifecycle/SKILL.md`** — the packaged/public plugin version of `worktree-test-isolation`. Same mechanism (per-worktree port/CDP/DB via `.env.worktree`), condensed to ~85 lines, cross-platform metadata (`claude-code, cursor, codex, github-copilot, opencode, ...`), ships as a full plugin with `hooks.json` (`SessionStart`/`SessionEnd` wired via `${CLAUDE_PLUGIN_ROOT}`) instead of the manual `~/.claude/hooks/` copy-and-register the standalone `INSTALL.md` requires.

**`plan-it`'s Test Contract discipline** (`/Users/macbook/Workspace/Devotts/plan-it/plugins/plan-it/skills/plan-it/SKILL.md` lines 137-186)
- Does: mandates that every PRD/epic end by authoring its own **binding Test Contract** — up to ~20 concrete use-cases/scenarios with expected outputs **registered at planning time**, not discovered mid-build. DoD = 100% of the contract passing; `/iterate` until green; no partial ship, no "VERIFIED-on-a-mock."
- Named disciplines invoked: **Specification by Example** (Gojko Adzic) + ATDD/BDD, and **Eval-Driven Development** for skill/LLM features.
- Per-shape count rule: large multi-squad programs get a ≥10-cases-per-epic floor; small single-feature packages get ~20 cases total.
- Test-type selection table by implementation shape: CRUD/REST → use-cases + e2e (API AND UI via CDP) + unit; skill/prompt/LLM function → use-cases w/ expected output, exact-match or LLM-judge (points at `make-eval`); agent/stateful → stress scenarios across six axes (async, fan-out, escalation, human-gate, recursion, cycle-guard); pure logic → unit + property-based; data pipeline → golden-value + idempotency/rollback; load/abuse surface → stress/adversarial.
- Execution path: `/full-qa` runs the contract, `/iterate` loops to 100%, `chrome-cdp-control` drives UI scenarios — "the contract is the bridge from plan-it → fable-it: fable-it's DoD = this contract." A `planit-guard.mjs` hook denies edits to PRD/epic files while the run's contract is unfrozen.

**`/Users/macbook/.claude/skills/test-coach/SKILL.md`** (brief) — read-only, real-time exam-coaching skill: watches a live browser test/assessment via CDP (never clicks), extracts question text via a 3-strategy DOM scraper, gives instant answers with score calibration toward a target. Explicitly NOT test-automation and NOT product-QA — it's personal exam-taking assistance. Out of scope for the consolidated QA skill; no reusable QA logic beyond the CDP read pattern it shares with the others.

**`/Users/macbook/.claude/skills/make-eval/SKILL.md`** (brief) — builds a minimal, deterministic eval harness for an LLM-backed classifier function (closed label set, exact-match scoring, never LLM-as-judge for closed labels). Prescribes a hand-written ~13-row dataset across 7 adversarial categories (happy path, empty/garbage, prompt injection, ambiguous, contradictory, non-English, "the dangerous case"), a harness that prints a confusion matrix and exits non-zero under threshold, and wiring into `npm test`/CI. Also prescribes hardening the LLM boundary itself (short-circuit on trivial input, robust JSON extraction, schema validation, quiet fallback logging) before the eval even runs. This is the concrete implementation referenced by plan-it's Test Contract row for "Skill / prompt / LLM function."

## 2. Overlap map

| Overlap | Files | Verdict |
|---|---|---|
| **full-qa exists twice** | `/Users/macbook/.claude/skills/full-qa/SKILL.md` (389 lines, standalone) vs. `/Users/macbook/Workspace/Devotts/fable-it/plugins/fable-it/skills/full-qa/SKILL.md` (319 lines, bundled) | **fable-it's version is strictly newer and better.** Direct diff shows it: (a) extracts all CDP mechanics into a shared `../references/cdp-core.md` instead of inlining ~130 lines of duplicated Python templates/selector-ladder/wait-strategy — DRY; (b) adds a hard **route guard**: any test case touching the user's authenticated real-Chrome session is refused and re-routed to `/chrome-cdp-control`, never run autonomously — the standalone version has no such guard; (c) changes exploratory testing from a fixed "run the top 3-5" to a **loop until 2 consecutive dry rounds**, with a "No silent caps" report section — closes a real coverage gap in the older version; (d) wires into the evidence ledger (`.taskstate/evidence.md`) and states explicitly it is a **feeder** into `/fable-it`'s unified DoD report rather than a competing verdict; (e) resolves `CDP_URL` from env instead of hardcoding `localhost:9222` — compatible with `worktree-test-isolation`'s per-worktree ports, which the standalone version is not. **Recommendation: treat the standalone `~/.claude/skills/full-qa` as deprecated/superseded; the new consolidated skill should fork from the fable-it version's structure, not the standalone one.**
| **worktree isolation exists twice** | `~/.claude/skills/worktree-test-isolation/` (user skill + hand-installed hooks) vs. `/Users/macbook/Workspace/Devotts/parallel-lifecycle/` (packaged plugin) | Same mechanism, not a fork-drift situation — `parallel-lifecycle` is the intentional public packaging of the user skill (cross-platform metadata, `hooks.json` instead of manual `~/.claude/hooks/` registration, condensed prose). Not competing; it's productization. The new QA skill should **depend on / assume `parallel-lifecycle`** rather than re-implement worktree isolation.
| **CDP action loop / selector ladder / wait strategy** | Standalone full-qa, fable-it full-qa, chrome-cdp-control, worktree-test-isolation, test-coach all contain some version of "screenshot → decide → act → screenshot → repeat" + selector priority + wait strategy | fable-it plugin already solved this with `references/cdp-core.md` as single source of truth. The standalone skills (full-qa, test-coach, worktree-test-isolation) each still inline their own copy — this is the top duplication risk if the new skill inlines a 4th copy.
| **Diagnose→fix→test→evaluate loop** | Standalone full-qa Phase 4 ("Bug Fix Cycle") vs. fable-it's `iterate` skill | Same loop shape; `iterate` is the more mature, generalized, non-CDP-specific version (adds adversarial skeptic-subagent challenge to root-cause hypotheses, evidence ledger, delegation gate). full-qa (both versions) explicitly says "you do not need to invoke `/iterate` separately" — i.e., full-qa's Phase 4 is a deliberate self-contained inline copy of iterate's loop for the QA context, not accidental drift. Acceptable duplication (documented), but worth deciding whether the new skill delegates to `/iterate` or keeps its own inline copy.
| **"Test plan / test cases with pass criteria"** | full-qa's Step 0 ingest, plan-it's Test Contract | Conceptually the same object (a set of scenarios with expected results) described from two different entry points — plan-it authors it at planning time, full-qa consumes it at QA time. Not duplicated logic, but the new skill should make explicit that its "test plan" input format IS (or maps 1:1 to) plan-it's Test Contract format, so a plan-it output can be fed straight into it without translation.
| **PR review** | `review-pr` (Engine-Core) vs. the general-purpose `code-review`/`review`/`security-review` skills listed as available in this session | Not read in depth (out of assigned scope) but worth flagging: `review-pr` is a static checklist with zero process/automation, while `code-review` (available skill) supports effort levels and `--fix`/`--comment`. These may already overlap; the new skill should decide whether it absorbs `review-pr`'s Engine-Core-specific checklist content as a *reference/config* for `code-review`-style automation, rather than reinventing PR review a third time.

## 3. Gap map — what no existing skill covers

1. **Unit-test authoring standards** — nothing in this set prescribes how to write a *new* unit test (naming, arrange-act-assert, mocking conventions, coverage targets). plan-it's table says "unit-test the logic" / "unit + property-based" but defers the how entirely. make-eval covers this only for the narrow LLM-classifier case.
2. **PR review depth/process** — `review-pr` is a checklist with no workflow (when to run it, how to triage severity, whether findings block merge, how to report). No skill here defines a PR-review *process* the way full-qa defines a QA *process*.
3. **Production-readiness / release checklist** — full-qa ends in a READY/NOT READY verdict for functional QA, but nothing covers non-functional gates: performance/load, security review sign-off, rollback plan, monitoring/alerting hooked up, migration safety, feature-flag state. plan-it's Test Contract row "Anything with load/abuse surface → stress/adversarial" gestures at this but there's no skill that executes it.
4. **Verifying side effects in third-party/external systems** — chrome-cdp-control covers driving a real authenticated browser, but nothing covers asserting that a webhook fired, a third-party API state changed, an email/SMS actually sent, or a payment provider recorded a charge (i.e., verifying integration side effects outside your own DB/UI). This is a real gap given Engine-Core's connector-heavy architecture (Mongo+Weaviate+Memgraph sync mentioned in review-pr; brain-connectors backfill/webhooks elsewhere in this repo).
5. **Test data / fixture management discipline** — full-qa's Phase 2 says "run setup steps... if none specified, check common patterns" — ad hoc, not a real strategy for seed data ownership, fixture factories, or test-DB reset idempotency across a multi-service stack.
6. **Regression/flake triage** — full-qa has a one-line "regression check: re-run any previously-PASS test," but no skill addresses flaky-test quarantine, retry policy, or distinguishing environment flakiness from real regressions.
7. **Non-UI/non-API test types**: contract testing between services (e.g., brain-api-core ↔ brain-connectors), schema/migration testing, and load/performance testing are named in plan-it's table but have no executing skill (full-qa is UI/API-only).
8. **Accessibility testing** — full-qa's selector ladder prefers ARIA roles (good practice) but there is no explicit a11y pass (contrast, keyboard nav, screen-reader labels).
9. **Cross-skill "which one do I invoke" routing** — with worktree-test-isolation/parallel-lifecycle, full-qa (x2), iterate, chrome-cdp-control, review-pr, test-coach, make-eval, code-review, verify, security-review, review all live in the ecosystem, there's no single decision doc for "given this QA task, which skill." This is arguably the core job of the new `test-it`/`qa-it` skill: **be the QA front door that routes to the right specialist**, mirroring how `fable-it` is the delivery front door that routes to `launch`/`iterate`/`full-qa`/`chrome-cdp-control`.

## 4. Packaging conventions (Devotts plugin family)

Exact structure observed across `plan-it`, `fable-it`, `parallel-lifecycle` (all under `/Users/macbook/Workspace/Devotts/<name>/`):

```
<repo-root>/<name>/
├── .claude-plugin/
│   └── marketplace.json          # top-level: lists this repo's plugin(s) for direct-add discovery
│                                  #   {$schema, name, owner:{name,url}, description, plugins:[{name, source, version,
│                                  #    description, author, homepage, license, keywords}]}
├── plugins/
│   └── <name>/                   # the actual installable plugin unit
│       ├── .claude-plugin/
│       │   └── plugin.json       # {$schema: claude-code-plugin-manifest.json, name, version, description,
│       │                          #  author:{name,url}, homepage, repository, license, keywords[]}
│       ├── skills/
│       │   ├── <name>/SKILL.md           # for single-skill plugins (parallel-lifecycle, plan-it): skill folder
│       │   │                             #   matches plugin name; may have its own scripts/ + references/
│       │   ├── <other-skill>/SKILL.md    # for multi-skill plugins (fable-it): one folder per bundled skill
│       │   │                             #   (fable-it, launch, iterate, full-qa, chrome-cdp-control)
│       │   └── references/               # shared cross-skill reference docs (cdp-core.md, model-tiers.md,
│       │                                  #   parallel-safety.md) — single source of truth, skills point at it
│       ├── hooks/                # optional: SessionStart/SessionEnd/etc. wired via hooks.json using
│       │   ├── hooks.json        #   "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh — no manual ~/.claude/hooks/ copy
│       │   └── *.sh / *.py
│       └── scripts/              # optional: helper scripts (connect.py, gate-check.mjs)
├── docs/                         # architecture.md, usage.md, installation.md
├── README.md, CHANGELOG.md, LICENSE
├── assets/                       # gifs/mp4/svg for the README
└── SKILL.md                      # top-level convenience copy for direct `cp -R` install (parallel-lifecycle,
                                   #   plan-it both keep one; mirrors plugins/<name>/skills/<name>/SKILL.md)
```

Frontmatter convention on every `SKILL.md` (per this session's CLAUDE.md, and observed in all Devotts-authored skills): `name`, `description`, `version`, `license: MIT`, `author: DevOtts`, `author_url: https://github.com/DevOtts`, `homepage`, `repository`, optional `metadata.platforms: [claude-code, cursor, codex, ...]` and `metadata.category`. Body ends with the footer line `_Authored by [DevOtts](https://github.com/DevOtts)._`.

`hooks.json` shape (from `parallel-lifecycle/plugins/parallel-lifecycle/hooks/hooks.json`):
```json
{"hooks": {"SessionStart": [{"matcher": "startup|resume", "hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/worktree-bootstrap.sh"}]}],
           "SessionEnd":   [{"matcher": "", "hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/worktree-teardown.sh"}]}]}}
```

For a new `test-it`/`qa-it` plugin, the conventional layout would be `/Users/macbook/Workspace/Devotts/test-it/` with `.claude-plugin/marketplace.json` at root, `plugins/test-it/.claude-plugin/plugin.json`, `plugins/test-it/skills/{test-it,<sub-skills>}/SKILL.md`, a shared `plugins/test-it/skills/references/` for anything reused across sub-skills (e.g., a QA report template, evidence-ledger conventions inherited from fable-it), and no plugin-owned hooks unless it needs its own SessionStart/End behavior distinct from `parallel-lifecycle`'s.

## 5. Recommendation seeds

**Absorb into the new consolidated skill:**
- fable-it's **full-qa** logic wholesale (it's already the best version) — including the route guard, the dry-loop exploratory testing, the "no silent caps" report section, and CDP-endpoint resolution via env rather than hardcoding.
- The **evidence-ledger discipline** (`evidence.md`, claim gate, VERIFIED-is-a-lookup) from fable-it's top-level SKILL.md — this is the mechanism that should make the new skill's report trustworthy, and it's designed to compose with `/fable-it` as a feeder rather than compete.
- plan-it's **Test Contract** as the canonical input format — the new skill should explicitly consume a Test Contract (or a full-qa-style test plan) and treat "up to ~20 scenarios, 100% pass = done" as its own DoD logic, closing the loop plan-it → (new skill) → fable-it.
- **make-eval**'s dataset/harness pattern for the "skill/prompt/LLM function" row of plan-it's test-type table — either absorbed as a sub-mode or referenced by name (mirrors how fable-it references `chrome-cdp-control` rather than copying it).
- `review-pr`'s Engine-Core-specific checklist content, but re-hosted as a **project-scoped reference/config** the new skill's PR-review mode loads, not as inline logic — this closes gap #2 (PR review depth/process) while keeping the project-specific knowledge separate from the generic skill.
- The **CDP core reference pattern** (`references/cdp-core.md`) — if the new skill needs any browser-driving logic, it should point at fable-it's existing `cdp-core.md` (or a synced copy) rather than write a 4th inline version.

**Stay standalone (do not absorb):**
- `worktree-test-isolation` / `parallel-lifecycle` — infrastructure the new skill *depends on and assumes is already running*, not something it re-implements. Keep as a prerequisite/dependency, referenced by name.
- `chrome-cdp-control` — the real-Chrome, per-write-confirmation manual driver is a distinct safety-critical tool; the new skill should route to it by name (as fable-it and full-qa already do) rather than merge its logic in.
- `iterate` — generic diagnose/fix loop useful far beyond QA; keep as a dependency the new skill delegates to for its bug-fix cycles, per fable-it's own "don't paste a worse copy here" principle.
- `test-coach` — unrelated domain (personal exam-taking assistance), zero overlap value beyond the CDP-read pattern it already shares. Leave untouched.

**Deprecate / fold:**
- **`/Users/macbook/.claude/skills/full-qa/SKILL.md`** (the standalone, older copy) — superseded by the fable-it bundled version per the diff above. Either delete it or replace its content with a pointer to the fable-it plugin's copy, so there is one full-qa, not two drifting ones.
- Consider whether `review-pr` should be fully retired once its checklist content is absorbed as a reference doc into the new skill's PR-review mode — leaving a bare pointer file if anything references it directly by name.

**Net shape for the new skill:** it should function as the **QA front door** analogous to how `fable-it` is the delivery front door — routing a QA/testing/review request to the right specialist (full-qa for functional QA, chrome-cdp-control for real-browser writes, make-eval for LLM-function evals, a new PR-review mode informed by review-pr, iterate for generic fix loops) while owning the parts nothing currently owns: the Test-Contract-to-DoD bridge, production-readiness/release-checklist gates, third-party side-effect verification, and a single evidence-ledger-backed report format shared with fable-it's conventions.
