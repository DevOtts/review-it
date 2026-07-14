# Test-authoring standards

Loaded by every mode that authors or expands cases (contract-qa expanding DoDs, the FR1.5 derive step, pr-review's "tests" checklist section). These are standards for tests review-it *writes or evaluates* — execution still routes to the specialists (CB-3).

## 1. Unit-test authoring

- **AAA shape** — Arrange / Act / Assert, one behavior per test; the test name states the behavior and the condition (`rejects_write_when_primary_field_missing`), not the method name.
- **Assert the positive.** A test that only proves "no error was thrown" or "result is not null" proves nothing (R3's sibling in unit form). Register the expected value, compare against it.
- **Mock boundaries — what NOT to mock.** Mock only at real system boundaries: external HTTP, clocks, randomness, third-party SDKs. Do **not** mock your own repository/service layers into agreement with the code under test — that is a DERIVED oracle in miniature (R11) and it is how 7 real bugs once sailed through a fully-mocked suite: every mock returned the shape the code expected, and the shapes were all wrong against the real DB. If the mock's return value was copied from the implementation, the test is self-grading.
- **Fixture/seed discipline.** Fixtures are committed, deterministic, and minimal; a test that depends on ambient live data is `one-time-live` on the PERSISTENCE axis (see `vocabularies.md`) and must be flagged as such.
- **Golden values are hand-computed** (or independently sourced) — never captured from the code's own first run without a human eyeball on them; captured-from-run values are DERIVED oracles and must be tagged.

## 2. Test-type selection by implementation shape

Carried from plan-it (`references/formats.md` §3–5 — the authoring source of truth; keep in sync with plan-it, don't fork):

- **CRUD / API+UI feature** → assert each scenario twice, API *and* UI (via CDP): happy / edge / authz rows.
- **Skill / LLM-output function** → registered expected outputs; closed outputs = exact match, open outputs = rubric / LLM-as-judge via `make-eval`. Small, high-quality set (≤20) drawn from real failure cases — no auto-bulked slop.
- **Stress / agentic flows** → scenario-based (six-axes) cases.
- **Pure logic** → property-based invariants alongside enumerated cases.
- **Classic epic table** (default): `| T-<EID>-NN | unit|integration|e2e | [REAL]? | Given/When/Then | assertion |` — keep IDs in the `T-<EID>-NN` grammar, don't drift mid-package.
- **Inverse-op discipline:** for every gate/rule the package claims to enforce, include at least one case that *violates* it and asserts the gate FIRES (CB-7). A gate that can't be shown to fail is not protection.

**Tier matrix** — declare how each case runs (data/creds, account plane, mode): T1 autonomous/synthetic/CI · T2 real-API/staging/manual · T3 supervised/prod/human-driven. Anything T1 can't cover must become a twin scenario or an explicit T2/T3 row — no silent gaps.

**Coverage map** — every requirement/goal ID maps to ≥1 case ID at the bottom of the plan; governance rules map to at least one *negative* case.

## 3. Evidence expectations for authored cases

Every case names, at authoring time, what it will be verified against (endpoint, table, page, log) — a case with no nameable verification path will end INV and should be flagged at authoring, not discovered at run time (verifiability precheck, front door Step 2).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
