# CI-gate guidance (reference, not an executable mode)

Carried from the shipped Engine QA System as *guidance* review-it quotes when a consumer asks how to wire its derived/authored cases into CI (PRD non-goal: CI-workflow authoring as a service is NOT a v1 mode). Pair with the tier model in `vocabularies.md` §2.

## Wiring rules

1. **Extend, never clobber.** Read the LIVE workflow file before editing; byte-diff after. Assume every existing job is load-bearing.
2. **Wire only scripts that exist.** A `test:e2e` entry pointing at a script nobody wrote is worse than no entry — it manufactures green. Verify the script target exists and runs locally before referencing it (dead `test:e2e` scripts were found in 3 real repos).
3. **CI / `origin/main` is the verification surface** — never a local checkout (contaminated by parallel sessions' worktrees and branches). Coverage/deadness claims resolve `origin/<branch>:<path>` (gate R9).
4. **Tier discipline** (vocabularies §2): Tier 0 (deterministic + service-free) may block PRs immediately. Tier 1 (service-backed) starts report-only (`continue-on-error: true`) and is promoted to blocking only after a stability record. Tier 2 `[REAL]` never blocks a PR — schedule it or park it on the pre-release checklist.
5. **Prove the gate can fail** (CB-7): sabotage a case on a marked revert-me commit, capture the failing and passing run IDs, then revert. A gate without a captured red run is not protection.

## Methodology invariants worth porting

- **Live-drift-aware golden asserts** — golden values against live systems carry a drift policy (pin + scheduled re-baseline), or they become permanent red noise.
- **Auth tests over service DNS, not localhost-exec** — exercising auth by exec'ing inside the container skips the ingress path where auth actually lives.
- **Grep is not proof of deadness** — code-grep claims need DB-syntax-aware filters and `origin`-resolved sources before "unused" verdicts.
- **Safety ladder for destructive ops** (CB-8): `backup → grep → soft-delete → soak → hard-delete → verify`. No step skipped, each step evidenced.
- **Status proxies are never deploy evidence** (gate R8) — CI badges and "Ready" states don't verify deploys; the deployed-code ladder does (see `skills/deploy-verify/SKILL.md`).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
