# Test Contract — `review-it` (master test plan)

**Binding.** DoD = every case below is PASS. No `[REAL]` case is VERIFIED on a mock; an unreachable `[REAL]` target → IMPLEMENTED-NOT-VERIFIED with a named blocker, never a fake green. Run via `/full-qa` + `/iterate` to 100%. Frozen against PRD.md v1.0 (contract §9).

**Totals:** Count: 22 · [REAL]: 4

**Design principle (inverse-op discipline):** for every gate rule R1–R10, at least one case *violates* the rule and asserts the gate FIRES (catches it) — the contract proves the gates work, not just that happy paths pass. A gate that can't be shown to fail is not protection (CB-7).

**Coverage map (G-ID / R-rule → case):** G-1→T-E1-01,02 · G-2→T-E3-01,02,03 · G-3→T-E3-04,05 · G-4→T-E3-06,07 · G-5→T-E3-08,09 · G-6→T-E2-01,02 · G-7→T-E1-03,04 · G-8→T-E1-05 · G-9→T-E4-01 · G-10→T-E5-01,02,03 · G-11→T-E1-06,07. R1→T-E3-01/02 · R2→T-E3-04/05 · R3→T-E3-03 · R4→T-E3-08 · R5→T-E1 setup+side-effects · R6→T-E2-01 · R7→T-E2-02 · R8→T-E3-08 · R9→T-E1-01 preflight · R10→T-E5-02 · R11→T-E1-06,07.

---

## E1 — scaffold + front door  (`epic/E1-scaffold`)

Count: 7 · [REAL]: 0

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-E1-01 | e2e | — | Given a plan-it Test Contract with 3 cases (1 pass, 1 fail, 1 unreachable-[REAL]); When `/review-it <contract>` runs; Then the report classifies each row | Report contains exactly PASS / FAIL / INV(+named blocker); zero rows with any other status; a preflight line names which app/branch/checkout was under test (R9) |
| T-E1-02 | unit | — | Given a case whose target is unreachable; When the run evaluates it; Then it is INV not PASS not FAIL | Row = `IMPLEMENTED-NOT-VERIFIED` with a non-empty blocker string tagged temporary\|structural |
| T-E1-03 | e2e | — | Given a target needing functional UI QA and one needing an authenticated real-Chrome write; When routing decides; Then each goes to its specialist | contract-qa → `fable-it:full-qa`; real-Chrome write → `fable-it:chrome-cdp-control`; no inlined copy of either in review-it's own SKILL files (grep proves reference-by-name) |
| T-E1-04 | e2e | — | Given an LLM-function eval target, a failing-fix-loop target, and a parallel-worktree need; When routing decides; Then correct specialist each | make-eval / iterate / parallel-lifecycle invoked by name; parallel-lifecycle assumed as dependency, not re-implemented |
| T-E1-05 | integration | — | Given the built plugin repo; When packaging is validated; Then Devotts-family structure + attribution present | `.claude-plugin/marketplace.json` + `plugins/review-it/.claude-plugin/plugin.json` valid JSON; every SKILL.md has `author: DevOtts` + `author_url` frontmatter and the footer line |
| T-E1-06 | e2e | — | Given a target WITH a plan-it artifact but no full Test Contract — only DoDs + goals (the common case); When `/review-it` runs the no-contract ladder (FR1.5); Then it locates the DoDs/goals as an AUTHORED oracle, expands them into cases, and labels provenance | Ladder step (a) resolves the DoDs/goals; derived cases run; every verdict row carries `AUTHORED` (oracle = plan DoD/goal); a `qa/test-plan-derived.md` is persisted; run does NOT refuse |
| T-E1-07 | e2e | — | Given a target with NO plan artifact at all (legacy code / external PR); When the ladder reaches step (b) and must derive expected values from the implementation; Then those verdicts are DERIVED and no green is reported as VERIFIED-against-plan (R11/CB-9 — the self-grading trap) | Cases whose only oracle is the code are tagged `DERIVED`; a DERIVED green renders as "self-consistent," never "obeys the plan"; unanchored cases listed in an accepted-gaps register (no silent caps); under autonomy the run is stamped DERIVED-UNCONFIRMED |

## E2 — references + honesty layer  (`epic/E2-references`)

Count: 2 · [REAL]: 0

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-E2-01 | integration | — | Given a subagent that reports "clicked insight X, row saved" but the DB shows no write (R6 violation); When the system-of-record adapter runs; Then the claim is rejected | Row demoted to FAIL/INV citing the DB/API query result; subagent narration alone never yields PASS |
| T-E2-02 | e2e | — | Given a draft report row claiming "single filter row" with a screenshot showing TWO rows (R7 violation); When the fresh-context verifier (given the screenshot dir) reviews; Then it CHALLENGES the row | Verifier flags the contradiction between pixels and prose; challenge must resolve by re-verify or demote before delivery |

## E3 — modes: side-effects, deploy-verify, pr-review  (`epic/E3-modes`)

Count: 9 · [REAL]: 2

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-E3-01 | e2e | — | Given a write to a third-party system that has both API and UI; When side-effects mode verifies; Then it reads the record back from BOTH surfaces | VERIFIED requires API GET (fields) AND UI render (display/primary-field); either alone is insufficient |
| T-E3-02 | unit | — | Given a write verified only by API GET (R1 violation — the Airtable `task_id` class, record renders empty in UI); When mode evaluates; Then it withholds VERIFIED | Status = `INV-in-UI`; the gate FIRES on GET-only evidence |
| T-E3-03 | integration | — | Given a read-after-write that returns null once then populated (R3 — Airtable lag); When stability gate runs; Then it re-reads before verdict | ≥2–3 reads performed and the raw sequence logged; single read never used as evidence; no false regression declared |
| T-E3-04 | e2e | — | Given a modal with a searchable combobox touched by the DoD; When operability gate runs; Then it operates the control | Asserts initial state + primary interaction (type into search, open popover, select a NON-default option) + post-action state |
| T-E3-05 | e2e | — | Given a CDP pass that only asserted rendered text + a terminal 403 (R2 violation — the 4-combobox-bug class); When the gate evaluates coverage; Then it flags the control as unverified-for-operability | "Shows a value" does not satisfy "is operable"; gate FIRES, row not PASS |
| T-E3-06 | integration | — | Given a PR diff and a loaded project checklist config; When pr-review mode runs; Then findings are severity-tiered and evidence-cited | Each finding has BLOCKER\|MAJOR\|MINOR\|NIT + a `file:line` citation |
| T-E3-07 | integration | — | Given pr-review findings; When the verdict assembles; Then blocking vs advisory are split and config-driven | Blockers gate the verdict; advisories don't; mode runs with zero config (generic checklist) too; does not duplicate `/code-review` logic (invokes it as executor) |
| T-E3-08 | e2e | [REAL] | Given a "merged"+"Ready" deploy whose new route is not actually live (R8); When deploy-verify runs the deployed-code ladder against staging/prod; Then it does not report deployed | curl new route (401/200 vs 404) / grep served HTML / digest-pin checked; status proxies alone rejected; human-reserved prod actions carry the first-look ask (R4) |
| T-E3-09 | e2e | [REAL] | Given `[REAL]`-tagged contract cases and a live staging/prod env; When deploy-verify re-runs them there; Then it emits a release verdict | Each [REAL] case re-run against live env (Tier-2: never blocks a PR); READY/NOT-READY with per-item PASS/INV evidence; rollback/monitoring/flag/migration items checked |

## E4 — deprecations  (`epic/E4-deprecations`)

Count: 1 · [REAL]: 0

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-E4-01 | integration | — | Given the superseded skills; When deprecation lands; Then no drifting duplicate remains | `~/.claude/skills/full-qa/SKILL.md` is a pointer to fable-it's copy (no duplicated logic body); Engine-Core `review-pr` → `.claude/review-config.md` config + pointer; fable-it/plan-it READMEs cross-link the new review stage |

## E5 — dogfood + community launch  (`epic/E5-dogfood-launch`)

Count: 3 · [REAL]: 2

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-E5-01 | e2e | [REAL] | Given one real recent feature/PR; When `/review-it` runs end-to-end against it; Then it produces a real report | Report generated on a genuine target with real tool-result evidence rows (not synthetic); at least one gate rule exercised on real code |
| T-E5-02 | e2e | [REAL] | Given the dogfood report; When a fresh-context verifier (DoD + report + evidence only, no build transcript) challenges it; Then every VERIFIED row survives or is demoted | Report survives the challenge; the R10 debrief question ("did any row get a false VERIFIED, which primitive would have caught it") is answered in the run |
| T-E5-03 | integration | — | Given the finished repo; When compared to fable-it/plan-it conventions; Then structure + docs match for community launch | README (+assets), CHANGELOG, LICENSE, docs/, valid marketplace.json + plugin.json; `skill-publisher` dry-run passes; layout parity with sibling plugins |

---
_Authored by [DevOtts](https://github.com/DevOtts)._
