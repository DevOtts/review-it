# PRD — `review-it`: the QA front door for the Devotts lifecycle family

| | |
|---|---|
| **Status** | v1.1 FROZEN — G3 approved (Fernando, 2026-07-14); amended 2026-07-14 (no-contract ladder); contract section (§9) is binding law |
| **Owner** | Fernando (DevOtts) |
| **Sponsor** | DevOtts plugin family (fable-it · plan-it · parallel-lifecycle · **this**) |
| **Reference artifacts** | `research-SYNTHESIS.md` (design input), `research-BRIEF.md`, `research/research-findings-{A..E}-*.md` |
| **Execution method** | `/fable-it` run against this PRD's Test Contract (`qa/test-plan-master.md`) |

`v1.1 changes (2026-07-14 amendment):` added FR1.5 no-contract ladder, gate rule R11 (oracle provenance — AUTHORED vs DERIVED, no self-graded green), goal G-11, and cases T-E1-06/07 (E1 count 5→7, package 20→22). Root: review-it is often invoked with no plan-phase Test Contract (legacy code, skipped-planning features, external PRs, community use); it must degrade honestly rather than refuse or self-grade — and plan-it's DoDs/goals count as an authored oracle even when full cases are absent. `v1.0 changes:` contract §9 frozen at G3 (2026-07-14); §13 launch block filled. `v0.95:` G2 decisions locked into §11; primary mission sharpened to contract verification (Fernando's D3 answer); deploy-verify mode elevated (staging/prod); community-launch packaging added to E5. `v0.9:` first full draft from research synthesis.

---

## 1. Summary

One plugin that consolidates two weeks of hard-won QA lessons into the **QA front door** of the lifecycle family: plan-it plans, fable-it builds, **review-it verifies**. **Primary mission (Fernando, G2): run the unit tests, e2e tests, and test-cases generated at plan phase to validate that what fable-it built obeys the plan** — the independent verification leg of the plan→build→review triangle. Around that core it routes execution to the existing specialists (`full-qa`, `iterate`, `chrome-cdp-control`, `make-eval`, `parallel-lifecycle`) and *owns* what no skill owns today: the gate catalog that kills false-VERIFIED claims (wrong-layer verification, presence-vs-operability, single-read evidence, narration-as-proof), third-party side-effect verification, staging/prod deploy-verification, a secondary PR-review process, and one evidence-backed report format shared with fable-it. Ships as a standalone public plugin repo following the fable-it/plan-it structure — built for community launch.

**Origin pain (the Airtable postmortem, finding D):** a fable-it run shipped "VERIFIED" UI that had 4 operability bugs CDP never exercised, and an Airtable write whose record rendered empty in Airtable's own UI — both caught by Fernando by hand. This plugin makes those two failures (and 8 sibling classes) mechanically un-shippable.

## 2. Goals (testable) + Non-goals

| G-ID | Goal | Test |
|---|---|---|
| G-1 | A Test Contract run through the skill yields a report where every row is PASS / FAIL / INV-with-named-blocker — no other states, no silent skips | T-E1-01, T-E1-02 |
| G-2 | A third-party write scenario cannot reach VERIFIED without system-of-record read-back (API **and** UI surface when both exist) + read-back stability (2–3 reads) | T-E3-01, T-E3-02, T-E3-03 |
| G-3 | A UI scenario cannot reach VERIFIED without operating every DoD-touched control (type / open / select non-default), not just asserting rendered text | T-E3-04, T-E3-05 |
| G-4 | PR-review mode produces severity-tiered, evidence-cited findings and a blocking/advisory split, loading project checklists (e.g. Engine-Core `review-pr`) as config | T-E3-06, T-E3-07 |
| G-5 | Deploy-verify mode proves the build works in staging/prod: deployed-code ladder, re-run of [REAL]-tagged contract cases against the live env, release checklist (rollback, monitoring, flags) → READY / NOT-READY with per-item evidence | T-E3-08, T-E3-09 |
| G-6 | Delegated/subagent claims are re-derived at the system of record before acceptance (narration is never evidence); verifier reads pixels when screenshots exist | T-E2-01, T-E2-02 |
| G-7 | The skill routes correctly: functional QA→full-qa, real-Chrome writes→chrome-cdp-control, LLM evals→make-eval, fix loops→iterate, isolation→parallel-lifecycle — never inlines a worse copy | T-E1-03, T-E1-04 |
| G-8 | Packaging installs as a Devotts-family plugin (marketplace.json + plugin.json + skills/ + references/) with DevOtts attribution on every SKILL.md | T-E1-05 |
| G-9 | Deprecation moves land: standalone `~/.claude/skills/full-qa` and Engine-Core `review-pr` become pointers, no drifting duplicates | T-E4-01 |
| G-10 | Dogfood: the skill runs against one real feature/PR and its report survives a fresh-context verifier challenge | T-E5-01, T-E5-02, T-E5-03 |
| G-11 | Invoked with NO plan-phase Test Contract, the skill never refuses and never self-grades: it runs the no-contract ladder (locate → derive → confirm → label → persist) and every verdict carries an AUTHORED/DERIVED oracle-provenance tag; a DERIVED green is never reported as VERIFIED-against-plan | T-E1-06, T-E1-07 |

**Non-goals:** re-implementing full-qa/iterate/chrome-cdp-control/make-eval logic; replacing fable-it's evidence ledger (we share its format — D2); CI-workflow authoring as a service (the Engine QA System's gate-wiring rules are carried as *reference guidance*, not an executable mode, in v1); test-coach anything; load/perf tooling beyond checklist pointers (v1).

## 3. Users & roles

- **Fernando / a human dev** — invokes `/review-it` on a feature, PR, or pre-release; reads the report; answers only human-reserved actions (credential flips, prod toggles — with the **first-look protocol**, §8 R7).
- **fable-it (conductor agent)** — invokes the skill as its QA phase; consumes the report rows into its evidence ledger and DoD table.
- **plan-it** — upstream author of the Test Contract the skill consumes 1:1 (no translation layer).
- **Subagent executors** (haiku/sonnet) — run scenarios under the skill's gates; their narration is never accepted as evidence (§8 R6).

## 4. Architecture

**Shape: front door + routed specialists + owned references** (mirrors fable-it's conductor pattern — "never paste a worse copy").

```
/review-it <target>                        # target: test-contract path | feature dir | PR | "staging"/"prod"
   │
   ├─ MODE: contract-qa   → PRIMARY: runs the plan-phase Test Contract (unit + e2e + use-cases)
   │                        via full-qa (+ parallel-lifecycle isolation) to validate fable-it's build
   ├─ MODE: side-effects  → third-party write verification (API + UI read-back, stability)
   ├─ MODE: deploy-verify → staging/prod verification: deployed-code ladder + re-run [REAL]-tagged
   │                        contract cases against the live environment + release readiness checklist
   └─ MODE: pr-review     → SECONDARY: severity-tiered review process; loads project checklist config
   ▼
  GATES (references/gate-catalog.md — the 10 classes, §8) applied in every mode
   ▼
  REPORT (references/report-format.md — shared vocabulary with fable-it evidence ledger)
```

- **Routing table** (owned by the front-door SKILL.md): functional/CDP QA → `fable-it:full-qa`; authenticated real-Chrome → `fable-it:chrome-cdp-control`; diagnose→fix loops → `fable-it:iterate`; LLM-function evals → `make-eval`; worktree/port/browser isolation → `parallel-lifecycle` (hard dependency, assumed installed).
- **Vocabulary layer** (references/): TYPE × PERSISTENCE two-axis classification; three-tier gate model (Tier-0 deterministic+service-free blocks, Tier-1 report-only until stable, Tier-2 [REAL] never blocks); status vocabulary PASS / FAIL / INV(+named blocker, temporary-vs-structural) ; skip taxonomy PASS / SKIP-no-script / SKIP-out-of-scope / BLOCK.

### 4.1 Execution accounts & credential boundaries

- The skill NEVER proposes a new credential storage location. **Directive-lookup gate (§8 R5):** before touching any credential question, grep CONTRACT/kickoff/CLAUDE.md/canonical creds files (`.secrets/.full.credentials`, `LOCAL-CREDENTIALS.md`, integration credential stores) for an existing ruling and quote it back; default to the incumbent pattern.
- Credential *operations* (rotate/revoke/flip) are always FERNANDO-GATED stop-gates; verification of a rotation is a live call, never the tracker.
- Real-Chrome sessions route to `chrome-cdp-control` with its per-write confirmation gate; autonomous QA never touches an authenticated session.

## 5. Data model

Plain-markdown artifacts (no DB), consistent with family conventions:

| Artifact | Location | Owner |
|---|---|---|
| Test Contract (input) | consumer project (plan-it output) | plan-it |
| Run report | consumer project `.review-it/` (or `.fable-it-reports/` when conducted) | this skill |
| Evidence ledger rows | `.taskstate/evidence.md` (fable-it format, shared) | this skill appends |
| Gate catalog / report format / vocabularies | `plugins/review-it/skills/references/*.md` | this plugin |
| Project checklist config (e.g. Engine-Core review checklist) | consumer repo `.claude/review-config.md` (convention) | consumer project |

## 6. Functional requirements (per surface)

**FR1 — front door (`skills/review-it/SKILL.md`)**
FR1.1 detect mode from target (contract path → contract-qa; PR ref → pr-review; "staging"/"prod"/pre-deploy → deploy-verify; write-integration DoD → side-effects; mixed → sequence).
FR1.2 verifiability precheck before any run: unreachable target → route to INV with named blocker, never a manufactured green.
FR1.3 preflight: assert WHICH app/checkout/branch is under test (`.env.worktree` contract, origin-resolution rule — never verdict from a stale local checkout).
FR1.4 emit the single report format; when run under fable-it, feed rows into its ledger instead of a competing verdict.
FR1.5 **no-contract ladder** — when no authored Test Contract is found, never refuse and never invent-and-grade. Run, in order:
  (a) **Locate** an oracle in priority order: plan-it Test Contract → **plan-it DoDs + goals** (authored before the build — partial but legitimate) → fable-it DoD/evidence ledger → PRD/epic acceptance criteria → PR/issue/commit description. Any hit is an AUTHORED oracle (R11).
  (b) **Derive** — only if none found, reverse-engineer candidate cases from the change surface (diff, endpoints, UI controls touched, third-party writes) using plan-it's test-type-selection table + `make-eval`. Anchor every *expected value* to an external source; where the only available oracle is the implementation itself, tag the case DERIVED and flag it.
  (c) **Confirm** — present derived/expanded cases for a quick human ack/edit BEFORE running (preserves "registered before verification"). Under fable-it autonomy with no human, proceed but stamp the run DERIVED-UNCONFIRMED.
  (d) **Label** — per R11, every verdict carries its oracle provenance; DERIVED green ≠ VERIFIED-against-plan; unanchored cases go to an accepted-gaps register (no silent caps).
  (e) **Persist** — write the resulting contract to `qa/test-plan-derived.md` so the review becomes durable, promotable coverage (feedable back into plan-it).

**FR2 — contract-qa mode**
FR2.1 consume plan-it Test Contract 1:1; tally declared vs counted cases; flag [REAL] rows. When only DoDs/goals exist (not full cases), expand them into cases via FR1.5(b–c) and tag oracle provenance per R11.
FR2.2 delegate execution to full-qa; enforce gate catalog on every row before accepting PASS.
FR2.3 100%-or-INV DoD; iterate loops via `iterate`.

**FR3 — pr-review mode**
FR3.1 process: diff scope → checklist config load → severity tiers (BLOCKER/MAJOR/MINOR/NIT) → evidence citation (`file:line`) per finding → blocking-vs-advisory split → verdict.
FR3.2 absorb Engine-Core `review-pr` checklist as the first config instance; the mode works with zero config (generic checklist) too.
FR3.3 never duplicate `/code-review`: this mode is the *process wrapper* (severity, evidence, gates); it may invoke code-review-style passes as executors.

**FR4 — deploy-verify mode (staging/prod)**
FR4.1 deployed-code ladder first (curl new route / grep served HTML / digest-pin — "merged ≠ deployable ≠ deployed"); never trust status proxies.
FR4.2 re-run the Test Contract's [REAL]-tagged cases against the live staging/prod environment (Fernando's G2 intent: "deploy to a staging or even prod to also test it working there") — respecting Tier-2 rules (never blocks a PR, honest INV on unreachable targets).
FR4.3 release checklist: rollback plan, monitoring/alerting, feature-flag state, migration safety (safety ladder for destructive ops), credential hygiene.
FR4.4 emits READY / NOT-READY with per-item PASS/INV evidence rows.

**FR5 — side-effects mode (the Airtable class)**
FR5.1 write-verification: record read back from the third-party's OWN surface — API GET for fields **and** UI render for display semantics (primary field, computed columns) when a UI exists. GET-only ⇒ `INV-in-UI`.
FR5.2 read-back stability: unexpected result → 2–3 stable re-reads before verdict; log the read sequence.
FR5.3 verify in the REAL target table/entity (not only scratch), covering its constraints (primary fields, required columns).

**FR6 — authoring standards (reference, loaded by all modes)**
FR6.1 unit-test authoring guide (AAA, naming, mock boundaries, what NOT to mock — the 7-bugs-mocks-missed lesson).
FR6.2 test-type selection by implementation shape (plan-it's table, carried verbatim).

## 7. Action adapters — the honesty layer

Every mode's verdict passes through the same honesty adapters before the report:
- **Evidence adapter**: a claim row must point at a same-session tool result (command output, screenshot path, API response) — "VERIFIED is a lookup, not a judgment call."
- **Fresh-context verifier** (top-tier model): gets ONLY DoD + draft report + evidence (incl. screenshot dir, licensed to challenge rows whose pixels contradict prose); CONFIRMs or CHALLENGEs each row; challenges resolve by re-verify or demote — never by prose.
- **System-of-record adapter**: any delegated state-mutating claim re-derived at DB/API/DOM-count.

## 8. Pattern/rule specs — the gate catalog (references/gate-catalog.md)

The 11 rules, each with trigger → test → action (R1–R10 evidence trail in research-SYNTHESIS.md §3; R11 added in the v1.1 amendment):

- **R1 wrong-layer**: third-party write VERIFIED only via target-system read-back on the human-visible surface (API + UI).
- **R2 operability**: every DoD-touched interactive control asserted on initial state + primary interaction + post-action state. "Shows a value" ≠ "is operable."
- **R3 read-stability**: single reads are not evidence; unexpected read-after-write ⇒ 2–3 re-reads, sequence logged; null results never prove anything — prove the positive.
- **R4 first-look**: human-reserved actions carry an explicit "ping me before acting" ask or the skill polls to observe first state; the human never becomes the un-instrumented first tester.
- **R5 directive-lookup**: credential/mechanism proposals require a prior grep of standing rulings, quoted back; incumbent pattern is the default.
- **R6 narration≠evidence**: subagent self-reports are provisional until re-derived at the system of record; cheap executors get app quirk-sheets and record-of-truth checks.
- **R7 pixels-over-prose**: verifier reads screenshots; a ledger quote proves a command ran, not that the claim is true.
- **R8 deploy-truth**: status proxies (MERGED, "Ready", green layer-cached builds) are never deploy evidence; run the deployed-code ladder.
- **R9 environment-identity**: before any verdict, prove which app/branch/checkout is under test; resolve `origin/<branch>:<path>` for coverage claims.
- **R10 debrief-methodology**: every run's debrief asks "did any row get a false VERIFIED, and which verification primitive would have caught it earlier?" — process lessons, not just bug lessons.
- **R11 oracle-provenance** (v1.1): classify every verdict by where its *expected outcome* (oracle) originates, not where the case came from. **AUTHORED** = oracle traces to a pre-build authored source (plan-it Test Contract / DoDs / goals, external spec, PR/issue). **DERIVED** = oracle reconstructed from the implementation/diff itself (no independent source). Trigger: any run whose cases weren't authored 1:1 from a plan-it contract. Test: does each verdict row carry an AUTHORED\|DERIVED tag, and is no DERIVED-oracle green labelled VERIFIED-against-plan? Action: run the FR1.5 ladder; deriving *cases* around an AUTHORED oracle (e.g. expanding a goal) stays AUTHORED; deriving the *expected value* from the code is DERIVED, needs human confirm, and its green means only "self-consistent," never "obeys the plan." No self-graded green.

## 9. Governance & privacy (binding — CONTRACT v1.1, FROZEN 2026-07-14)

> **Amendment v1.0 → v1.1 (2026-07-14, owner Fernando):** added CB-9 (oracle provenance / no self-graded green) below, plus FR1.5, R11, G-11, and cases T-E1-06/07. Reason: review-it is frequently invoked with no plan-phase Test Contract; it must degrade honestly. Per plan-it Rule 1, folded back as a dated amendment, not a silent edit.


- **CB-1** Status vocabulary is closed: PASS / FAIL / INV(+named blocker, temp-vs-structural). Skip taxonomy closed: SKIP-no-script / SKIP-out-of-scope. No other states may appear in a report.
- **CB-2** Fake-green and lazy-INV are the same sin: INV rows re-tested when blockers lift; PASS rows demoted on challenge.
- **CB-3** No mode may inline logic owned by a routed specialist (full-qa/iterate/chrome-cdp-control/make-eval/parallel-lifecycle) — reference by name.
- **CB-4** Every SKILL.md ships DevOtts attribution (frontmatter `author`/`author_url` + footer).
- **CB-5** Report format and evidence-ledger row schema are shared with fable-it — one source of truth in references/, both plugins point at it (pending D2).
- **CB-6** Credential ops are human-gated; leaked-key inventories are hash-only; rotations verified by live call.
- **CB-7** Adversarial self-check: any new gate/checklist the skill wires must be proven able to fail (a deliberately broken case goes red) before it counts as protection.
- **CB-8** The plugin never writes to consumer repos outside its report/ledger conventions; no destructive ops without the safety ladder.
- **CB-9** (v1.1) **No self-graded green.** review-it may verify only against an oracle whose expected outcome originates independently of the implementation under test. When it must derive expected values from the code itself, the verdict is tagged DERIVED and its green means "self-consistent," never "obeys the plan." A run with no authored oracle never refuses — it runs the FR1.5 ladder and labels provenance per R11.

## 10. Success metrics

- Zero recurrence of the 11 failure classes in fable-it runs that use the skill (tracked via R10 debrief rows).
- Human-found-bug rate after "VERIFIED" → target 0 (the Airtable metric).
- Adoption: fable-it's QA phase routes through this skill; standalone full-qa deleted without loss.

## 11. Decisions — LOCKED at G2 (owner: Fernando, date: 2026-07-14)

| # | Decision | LOCKED answer |
|---|---|---|
| D1 | **Name** | **`review-it`** — repo `Devotts/review-it`, command `/review-it` |
| D2 | Verifier + evidence-ledger ownership | **review-it hosts** `references/report-format.md` as single source of truth; fable-it points at it in its next release (no fable-it edit required for v1) |
| D3 | Sub-skill split + scope | **Front door + bundled specialists**, with contract-qa as the PRIMARY identity. Fernando: *"my original idea is that it run the unit tests and e2e and test-cases generated at plan phase to validate what fable-it did obey the plan phase"* — PR review accepted as SECONDARY mode; staging/prod verification elevated: *"probably we will want to deploy to a staging or even prod to also test it working there as well"* → `deploy-verify` mode |
| D4 | Fate of superseded skills | **Deprecate both**: `~/.claude/skills/full-qa` → pointer to fable-it's copy; Engine-Core `review-pr` → `.claude/review-config.md` config + pointer. Clarified: review-it is a **new standalone public plugin repo following the fable-it/plan-it repository structure and documentation — it will be launched to the community** |
| D5 | Third-party side-effect verification | **Own bundled skill** with its own reference doc — first-class status (the Airtable failure class) |

## 12. Agile plan

| Epic | Scope | Exit gate |
|---|---|---|
| E1 `epic/E1-scaffold` | Repo scaffold, marketplace.json, plugin.json, front-door SKILL.md (routing, modes, preflight, verifiability precheck, **FR1.5 no-contract ladder + R11 provenance**), DevOtts attribution | T-E1-01..07 pass; gate-check-style lint on packaging |
| E2 `epic/E2-references` | gate-catalog.md (R1–R10), report-format.md, vocabularies (two-axis, tiers, statuses), authoring-standards.md, ci-gate-guidance.md (Engine QA System rules as guidance) | T-E2-01/13 pass; every R-rule has trigger→test→action |
| E3 `epic/E3-modes` | side-effects, deploy-verify, pr-review bundled skills | T-E3-01..T-E3-09 pass |
| E4 `epic/E4-deprecations` | full-qa pointer, review-pr → config conversion, family cross-links (fable-it/plan-it READMEs mention the new stage) | T-E4-01 pass; no drifting duplicate remains |
| E5 `epic/E5-dogfood-launch` | Run the skill on one real target (a recent PR or feature); fresh-context verifier challenge; full community-launch packaging per family conventions: README (+assets), CHANGELOG, LICENSE, docs/, marketplace.json validation, publish prep (`skill-publisher`) | T-E5-01/02/03 pass; report survives challenge; repo structure byte-parity with fable-it/plan-it conventions |

Tasks are file:line-scoped inside each epic at build time (fable-it breakdown); dependency order E1→E2→E3→{E4,E5}.

## 13. /launch handoff block

The copy-paste launch prompt for `/fable-it` lives in `delivery/KICKOFF.md` (generated at freeze, pinned to repo SHA + contract SHA-256). Summary of the handoff: build epics E1→E2→E3→{E4,E5} in dependency order against the frozen §9 contract; DoD = 100% of `qa/test-plan-master.md` passing (or honest INV with named blocker); the run is itself the first dogfood of review-it's own gates (E5).

## 14. Verification strategy

- **Test tiers**: the plugin is a skill — its Test Contract is use-case/scenario-driven (Specification by Example) with expected outputs registered in `qa/test-plan-master.md` (~20 cases, per small-shape rule). [REAL] cases: the dogfood run (T-E5-01..20) and side-effects verification against a live third-party (Airtable test base) — never VERIFIED on a mock.
- **Coverage map**: every G-ID ↦ ≥1 TC case (table in §2); every R-rule ↦ ≥1 case that *violates* it and must be caught (inverse-op discipline — the contract tests that the gates FIRE, not just that happy paths pass).
- **Execution**: `/fable-it` runs E1–E5 with this contract as DoD; `/iterate` to 100%.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
