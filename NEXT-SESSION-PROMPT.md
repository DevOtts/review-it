# NEXT-SESSION-PROMPT — continue the review-it/test-it/qa-it skill creation

**State as of 2026-07-14: PLANNING COMPLETE — plan-it machine at `done`.** All 3 gates approved (Fernando 2026-07-14); contract frozen; Test Contract written; all gate-checks green. **The next action is BUILD, not plan: run the launch prompt at the bottom of `KICKOFF.md` in a fresh session at `/Users/macbook/Workspace/Devotts/review-it/` to have `/fable-it` build the plugin (E1→E5).** Authoritative state: `.plan-it/state.json`. Predecessor planning session: `review-it-skill-plan` (8fai subscription, cwd Engine-Core).

## Delivery package (all on disk, all lints PASS)
- `PRD.md` — v1.0 FROZEN, the Shape-2 single-file PRD; §9 is the binding contract. SHA-256 pinned in KICKOFF §0.
- `qa/test-plan-master.md` — binding Test Contract, 22 cases (4 `[REAL]`), grouped by epic E1–E5 (v1.1: +T-E1-06/07 for the no-contract ladder).
- `delivery/TEST-CONTRACT-REVIEW.md` — FD-2 human-review artifact (Reviewed-by Fernando).
- `KICKOFF.md` — orientation + the copy-paste `/fable-it` launch prompt (pinning block, locked decisions, gotchas).
- `research-SYNTHESIS.md` + `research/` + `research-BRIEF.md` — design corpus (research phase).
- `.plan-it/state.json` — machine at `done`; gate-checks: freeze PASS, handoff PASS, state PASS, adversary N/A.

## Original research handoff (kept for reference)

## What exists in this folder (`/Users/macbook/Workspace/Devotts/review-it/`)

- `research-BRIEF.md` — the goal, Fernando's original ask, his 3 flagged Airtable failures, inputs studied.
- `research-SYNTHESIS.md` — **the main design input**: skill shape, vocabulary/models to encode, 10 failure-class gates, wins to build on, consolidation moves, 5 open decisions.
- `research/research-findings-{A..E}-*.md` — the 5 raw subagent reports (qa-system docs, skills inventory, e2e session, airtable postmortem, session histories) with evidence and exact paths.

## Exact next action

Run **`/plan-it`** for the new skill with `research-SYNTHESIS.md` + `research-BRIEF.md` as pre-grounded input. Instruct plan-it explicitly:

1. **Research/discovery is already done — do NOT re-run the research fan-out.** Feed the synthesis as the grounding corpus.
2. Target: a new Devotts plugin at `/Users/macbook/Workspace/Devotts/<name>/` following the family packaging (see synthesis §5 packaging; sibling repos plan-it/fable-it/parallel-lifecycle are the templates).
3. At the ONE batched human-decision gate, put the 5 open decisions from synthesis §6 to Fernando — **especially the name** (test-it / review-it / qa-it; this folder is provisionally `review-it/` — rename the folder if Fernando picks differently).
4. Every epic must end in a binding Test Contract (plan-it's own rule) — and, dogfooding, those contracts should exercise the new skill's own gates (synthesis §3 table).
5. The plan should include: SKILL.md(s) authoring, the shared references (report format, gate catalog, third-party side-effect verification), deprecation/pointer moves for superseded skills (`~/.claude/skills/full-qa`, Engine-Core `review-pr`), README/marketplace packaging, and eating-own-dogfood eval (run the new skill on a real PR/feature to validate).

## Constraints / reminders

- DevOtts attribution on every authored SKILL.md (frontmatter + footer) — global CLAUDE.md rule.
- Usage limits: the predecessor session ended near the subscription cap. If limited, ScheduleWakeup-chain per the global overnight-resilience rule.
- Do not modify the existing sibling plugins as part of planning; consolidation moves ship with the build, not the plan.
