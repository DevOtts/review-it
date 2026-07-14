# Methodology — why these gates

review-it consolidates two weeks of hard-won QA lessons from real autonomous-delivery
runs, root-caused in the repo's `research-SYNTHESIS.md`. The short version:

## The failure taxonomy

Every gate traces to a real, named incident — not a hypothetical:

| Gate | Canonical incident |
|---|---|
| R1 wrong-layer | Airtable `task_id` primary-field bug: every API GET correct, record rendered empty in Airtable's UI |
| R2 operability | 4 combobox bugs behind a "verified" modal — CDP checked rendered text + a terminal 403, never typed/opened/selected |
| R3 read-stability | Airtable read-after-write lag: null once, populated on re-read |
| R4 first-look | the human flipped the writes toggle and created the first record before the sanctioned verification ran |
| R5 directive-lookup | a credentials question asked despite a standing ruling in the project docs |
| R6 narration≠evidence | haiku CDP executors echoing their instructions back as "results" |
| R7 pixels-over-prose | ledger said PASS, the screenshot showed the regression |
| R8 deploy-truth | `MERGED` + "Ready" while the route 404'd; a docker layer-cache caching a failed install as success |
| R9 environment-identity | port :3000 served a different app than the one "under test" |
| R10 debrief-methodology | a postmortem that logged 4 tactical bugs and zero process lessons |
| R11 oracle-provenance | a no-contract run deriving its expectations from the code under test and grading itself green |

## The design principles

- **Specification by Example** — the plan phase registers expected outcomes
  (plan-it's Test Contract); review-it compares reality against them. Registered before
  verification, or labeled honestly if not (R11).
- **Inverse-op discipline (CB-7)** — a gate isn't protection until a deliberately broken
  case has made it go red. review-it's own Test Contract includes a violation case for
  every gate.
- **VERIFIED is a lookup** — a claim may read PASS only if the evidence ledger holds a
  same-session tool result demonstrating it. Honesty becomes mechanical, not moral.
- **Fresh eyes** — the final verifier never saw the run happen; it gets the contract,
  the report, the ledger and the screenshots, and it challenges by default.
- **Front door, not a monolith** — execution belongs to the existing specialists
  (`full-qa`, `iterate`, `chrome-cdp-control`, `make-eval`, `parallel-lifecycle`).
  Duplicated logic is duplicated truth; it drifts.

## Two-axis coverage

Every case is classified TYPE (what it checks) × PERSISTENCE (who reruns it). The
second axis is the one teams forget: a brilliant one-time-live check is a silent gap
tomorrow. See `plugins/review-it/skills/references/vocabularies.md`.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
