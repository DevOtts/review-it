# KICKOFF — build `review-it` with /fable-it

## 0. Pinning (verify before building)

- **Repo:** `/Users/macbook/Workspace/Devotts/review-it/` — **not yet git-initialized** (E1's first task: `git init`, first commit of the planning package, create GitHub repo `DevOtts/review-it`).
- **Run state:** `/Users/macbook/Workspace/Devotts/review-it/.plan-it/state.json` (machine at `handoff`/`done`).
- **Frozen contract:** `PRD.md` §9 v1.1 · SHA-256 `462cb00745be…` (recompute `shasum -a 256 PRD.md` for the full value; if it differs, the contract was edited after freeze — stop and reconcile).
- **Test Contract:** `qa/test-plan-master.md` — 22 cases, 4 `[REAL]`.
- **Builder's FIRST numbered step:** re-derive the case tally from disk (`node <plan-it>/scripts/gate-check.mjs handoff qa/`) and reconcile against PRD §12 exit gates; stop-and-report on any mismatch.

## 1. One-liner

Build the `review-it` Claude Code plugin — the QA front door of the DevOtts lifecycle family (plan-it plans → fable-it builds → **review-it verifies**). It runs the plan-phase Test Contract to prove a build obeys the plan, and enforces a 10-rule gate catalog that makes the Airtable-class false-VERIFIED failures un-shippable.

## 2. First slice

**E1 — scaffold + front door.** Stand up the Devotts-family plugin skeleton (marketplace.json, plugin.json, front-door `skills/review-it/SKILL.md` with routing + modes + preflight + verifiability precheck), git-init, and prove packaging + routing + report-vocabulary cases (T-E1-01..05) before fanning out to references and modes.

## 3. Repo/build map (dependency order)

```
E1 scaffold ─▶ E2 references ─▶ E3 modes ─▶ ┬─ E4 deprecations
(front door)   (gate-catalog,   (side-effects, │  (full-qa+review-pr pointers)
               report-format,    deploy-verify, └─ E5 dogfood + community launch
               vocab, authoring)  pr-review)        (real run + verifier + packaging)
```

Target layout (mirror `Devotts/fable-it`, `Devotts/plan-it`):
```
review-it/
  .claude-plugin/marketplace.json
  plugins/review-it/
    .claude-plugin/plugin.json
    skills/review-it/SKILL.md          # front door (contract-qa PRIMARY + routing)
    skills/side-effects/SKILL.md       # third-party write verification
    skills/deploy-verify/SKILL.md      # staging/prod verification
    skills/pr-review/SKILL.md          # SECONDARY review process
    skills/references/                 # gate-catalog.md, report-format.md, vocabularies.md,
                                       #   authoring-standards.md, ci-gate-guidance.md
  docs/  README.md  CHANGELOG.md  LICENSE  assets/
```

## 4. Locked decisions (from G2, honor these)

1. Name = `review-it` (command `/review-it`, repo `DevOtts/review-it`).
2. `review-it` hosts `references/report-format.md` as the single source of truth; fable-it points at it later (no fable-it edit needed for v1).
3. Front door + bundled specialists; **contract-qa is the PRIMARY identity**; pr-review is SECONDARY; deploy-verify (staging/prod) is elevated.
4. Deprecate both superseded skills — `~/.claude/skills/full-qa` → pointer; Engine-Core `review-pr` → `.claude/review-config.md` config + pointer.
5. Third-party side-effect verification is its own bundled skill (first-class).
6. Public community-launch repo following fable-it/plan-it structure + docs; DevOtts attribution on every SKILL.md (frontmatter + footer).

## 5. Gotchas / carried lessons

- The gate catalog (PRD §8 R1–R10) is the crown jewel — build the references (E2) before the modes (E3) so modes reference one source of truth, never inline copies.
- **Dogfood is binding:** E5 runs review-it on a real target and subjects the report to a fresh-context verifier (T-E5-01/02, both `[REAL]`). Do not mark these VERIFIED on a mock.
- `[REAL]` cases (T-E3-08, T-E3-09, T-E5-01, T-E5-02) need a live env / real Chrome / real third-party; unreachable → INV with named blocker, never fake green.
- Never re-implement full-qa/iterate/chrome-cdp-control/make-eval/parallel-lifecycle — reference by name (CB-3).

## 6. Handoff state

Planning package complete: `PRD.md` (v1.0 frozen), `qa/test-plan-master.md` (20 cases), `research-SYNTHESIS.md` + `research/` (design corpus), `.plan-it/state.json` (machine). Gate-checks: freeze PASS, handoff PASS, adversary N/A (linear skill-authoring workflow, no declared state machine). DoD = 100% of the Test Contract passes (or honest INV).

---

## LAUNCH PROMPT (copy-paste into a fresh session at `/Users/macbook/Workspace/Devotts/review-it/`)

```
/fable-it

GOAL: Build the `review-it` Claude Code plugin — the QA front door of the DevOtts
lifecycle family — exactly to the frozen plan in this repo.

READ FIRST (in order): KICKOFF.md (§0 pinning — recompute the PRD SHA-256 and stop if
it moved), PRD.md (v1.0, the frozen contract is §9), qa/test-plan-master.md (the binding
20-case Test Contract), then research-SYNTHESIS.md for the design rationale.

DEFINITION OF DONE (numbered):
1. E1 scaffold: git-init the repo + create DevOtts/review-it; Devotts-family packaging
   (marketplace.json + plugins/review-it/plugin.json); front-door skills/review-it/SKILL.md
   with the 4 modes, routing table, preflight, verifiability precheck, and the FR1.5
   no-contract ladder + R11 oracle-provenance (AUTHORED vs DERIVED, no self-graded green;
   plan-it DoDs/goals count as an authored oracle). Cases T-E1-01..07 PASS.
2. E2 references: skills/references/{gate-catalog.md (R1–R10, each trigger→test→action),
   report-format.md (shared evidence-ledger schema), vocabularies.md (TYPE×PERSISTENCE,
   3-tier gates, PASS/FAIL/INV, skip taxonomy), authoring-standards.md, ci-gate-guidance.md}.
   Cases T-E2-01..02 PASS.
3. E3 modes: skills/{side-effects,deploy-verify,pr-review}/SKILL.md. Cases T-E3-01..09 PASS.
4. E4 deprecations: ~/.claude/skills/full-qa → pointer to fable-it's copy; Engine-Core
   review-pr → .claude/review-config.md + pointer; fable-it/plan-it READMEs cross-link the
   new review stage. Case T-E4-01 PASS.
5. E5 dogfood + launch: run /review-it on one real recent feature/PR; subject the report to
   a fresh-context verifier; full community-launch packaging (README+assets, CHANGELOG,
   LICENSE, docs/, valid marketplace.json+plugin.json, skill-publisher dry-run). Cases
   T-E5-01..03 PASS.
6. DoD = 100% of qa/test-plan-master.md passes, or honest IMPLEMENTED-NOT-VERIFIED with a
   named blocker for any unreachable [REAL] case. Every authored SKILL.md carries DevOtts
   attribution (frontmatter author/author_url + footer line).

CONSTRAINTS: honor the 6 locked decisions in KICKOFF §4. Never re-implement a routed
specialist (CB-3) — reference full-qa/iterate/chrome-cdp-control/make-eval/parallel-lifecycle
by name. Build in dependency order E1→E2→E3→{E4,E5}. This build is itself the first dogfood
of review-it's own gates — apply them to your own verification.
```

---
_Authored by [DevOtts](https://github.com/DevOtts)._
