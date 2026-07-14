# Research Brief — new consolidated QA/testing/review skill (name TBD: test-it / review-it / qa-it)

**Date:** 2026-07-14 · **Origin session:** `review-it-skill-plan` (cwd Engine-Core, 8fai subscription — `/read-chat "review-it-skill-plan"` for full context)
**Status:** Research COMPLETE (5 findings + synthesis in `research/` and `research-SYNTHESIS.md`). Planning NOT started.

## Goal (Fernando's ask, verbatim intent)

Consolidate everything learned over the last ~2 weeks of implementations on **code quality, unit tests, review, e2e, and production-ready code** into ONE new skill/plugin living under `/Users/macbook/Workspace/Devotts/<new-skill>/`, joining the development-lifecycle plugin family:

- `fable-it` (delivery orchestrator) — https://github.com/DevOtts
- `plan-it` (planning front-end; produces Test Contracts)
- `parallel-lifecycle` (worktree/port/CDP isolation infra)

**Name is an OPEN DECISION**: test-it vs review-it vs qa-it. (Fernando named this session "review-it-skill-plan", a weak signal toward `review-it`, but he explicitly said "not sure what is the best name yet" — ask at the plan-it decision gate.)

## Inputs studied (all done)

1. `Engine-Core/docs/implementation/0-done/qa-system/` — the shipped Engine QA System package → `research/research-findings-A-qa-system-docs.md`
2. Existing skills: `~/.claude/skills/worktree-test-isolation`, `~/.claude/skills/full-qa`, Engine-Core `review-pr`, fable-it's bundled `full-qa`/`iterate`/`chrome-cdp-control`, parallel-lifecycle, plan-it Test Contracts, `test-coach`, `make-eval` → `research/research-findings-B-skills-inventory.md`
3. Session `done-e2e-unit-tests-execution` (8ftools/Engine-Core) — QA program execution → `research/research-findings-C-e2e-unit-tests-session.md`
4. Session `done-airtable-write-exec` (loudr/Loudr) — POSTMORTEM Fernando requested, with his 3 flagged failures root-caused → `research/research-findings-D-airtable-postmortem.md`
5. Consolidated histories: `LOUDR-CLAUDE-SESSION-HISTORY.md`, vault lessons (qa-system, pulse, agent-backbone), `.fable-it-reports/lessons.md` → `research/research-findings-E-session-histories.md`

## Fernando's three flagged failures from the Airtable session (must be prevented by the new skill)

1. **Credentials directive ignored** — session questioned k8s env vars despite standing directive to use brain-integration/brain-connector credential store. (Postmortem note: the exact exchange wasn't found in THIS transcript — may live in a sibling/planning session — but the prevention gate stands.)
2. **False e2e pass via CDP** — "e2e passed" but the dropdown/combobox had 4 UI bugs Fernando found by hand. Root cause: CDP asserted rendered text + terminal 403, never *operated* the controls (type/open/select).
3. **Unverified third-party side effect** — the Airtable write was never verified by looking at the record in Airtable's own UI; the `task_id` primary-field bug was invisible to API GET read-backs and was caught by Fernando.

Framing: not blame — an opportunity to improve testing, test-case scenarios, and deliverable quality.

## Next step

Run `/plan-it` with `research-SYNTHESIS.md` as the pre-grounded input (research phase already done — do NOT redo it). See `NEXT-SESSION-PROMPT.md`.
