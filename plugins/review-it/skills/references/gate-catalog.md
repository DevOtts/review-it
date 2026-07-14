# Gate catalog — the 11 rules (R1–R11)

The gates that make false-VERIFIED claims un-shippable. Every mode applies every applicable gate to every row before accepting a PASS. Each rule is written as **trigger → test → action**. Evidence trail for R1–R10: `research-SYNTHESIS.md` §3 in the review-it repo (the Airtable postmortem + corpus mining); R11 added in the PRD v1.1 amendment.

**CB-7 discipline:** a gate you wire is not protection until a deliberately broken case has made it go red. Verify the verifier.

---

## R1 — wrong-layer (third-party writes)

- **Trigger:** any claim that a write to a third-party system (Airtable, Slack, Shopify, CRM, payment provider…) succeeded.
- **Test:** was the record read back from the target system's OWN surface — API GET for field values **and** the UI render for display semantics (primary field, computed columns) when a UI exists?
- **Action:** GET-only evidence ⇒ status `INV-in-UI`, not PASS. Sender-side success codes, queue acks, or our own DB rows are the wrong layer and prove nothing about the target. Canonical incident: Airtable `task_id` primary-field bug — every API GET correct, record rendered "empty" in Airtable's UI.

## R2 — operability (UI controls)

- **Trigger:** any UI scenario whose DoD touches an interactive control (input, combobox, popover, select, toggle…).
- **Test:** for each touched control, did the run assert (a) initial state, (b) the primary interaction — type into the search, open the popover, select a NON-default option — and (c) post-action state?
- **Action:** rendered text alone ⇒ the control is `unverified-for-operability`; the row is not PASS. "Shows a value" ≠ "is operable." Canonical incident: 4 combobox bugs behind a "verified" modal — CDP had checked rendered text and a terminal 403, never typed/opened/selected.

## R3 — read-stability (single reads)

- **Trigger:** any read-after-write whose result is unexpected (null, empty, stale), or any verdict about to rest on a single read.
- **Test:** were 2–3 re-reads performed, and is the raw read sequence logged in the evidence?
- **Action:** single read ⇒ not evidence. Re-read before any verdict; a null result never proves anything (absence is not evidence of absence under lag) — prove the positive. No false regression may be declared off one read. Canonical incident: Airtable read-after-write lag — null once, populated on re-read.

## R4 — first-look (human-reserved actions)

- **Trigger:** any step reserved for the human (credential flip, prod toggle, first live write).
- **Test:** does the run either carry an explicit "ping me before acting" ask, or poll so the instrumented run observes first state before the human touches it?
- **Action:** never let the human become the un-instrumented first tester. Canonical incident: the human flipped `enableWrites` and created the first task before the sanctioned verification ran.

## R5 — directive-lookup (credentials & mechanisms)

- **Trigger:** any question or proposal about credential storage, env plumbing, or a "new mechanism" for something the project already does.
- **Test:** was CONTRACT / kickoff / CLAUDE.md / the canonical creds files grepped for an existing ruling, and is the ruling quoted back?
- **Action:** no grep ⇒ no proposal. Default to the incumbent pattern. Credential operations (rotate/revoke/flip) are human-gated; rotations verified by live call, never the tracker.

## R6 — narration ≠ evidence (delegated claims)

- **Trigger:** any state-mutating claim arriving from a subagent/executor ("clicked X, row saved").
- **Test:** was the claim re-derived at the system of record — DB query, API GET, DOM count — by the conductor before acceptance?
- **Action:** narration alone ⇒ the row is provisional; re-derive or demote to FAIL/INV citing the record-of-truth query. Cheap executors get app quirk-sheets and record-of-truth checks; echoed instructions are not results. Canonical incident: haiku CDP agents echoing their instructions back as "results."

## R7 — pixels-over-prose (verifier reads screenshots)

- **Trigger:** a draft report with screenshot evidence attached to any row.
- **Test:** did the fresh-context verifier actually open the screenshots, and do the pixels agree with the prose?
- **Action:** the verifier gets the screenshot dir and explicit license to CHALLENGE rows whose images contradict their text; a ledger quote proves a command ran, not that the claim is true. Challenges resolve by re-verify or demote — never by prose. Canonical incident: ledger said PASS, screenshot showed the regression.

## R8 — deploy-truth (status proxies)

- **Trigger:** any claim that code is deployed / live / released.
- **Test:** was the deployed-code ladder run — curl the new route (401/200 vs 404), grep the served HTML for the new marker, or pin the image digest — against the actual environment?
- **Action:** MERGED, "Ready", a green layer-cached build, or a dashboard badge are never deploy evidence. "Merged ≠ deployable ≠ deployed." Canonical incidents: `MERGED`+"Ready" with the route 404ing; `npm ci || true`; docker layer-cache caching a failed install as success.

## R9 — environment-identity (what is under test)

- **Trigger:** the start of any run, and any verdict about coverage/deadness.
- **Test:** is there a preflight line proving WHICH app / checkout / branch / port is under test (`.env.worktree` contract in worktrees; `origin/<branch>:<path>` resolution for coverage claims)?
- **Action:** no identity proof ⇒ no verdict. A stale local checkout or a port squatted by another app is never the verification surface. Canonical incident: app on :3000 was a different project entirely; a stale branch grep'd as "coverage missing."

## R10 — debrief-methodology (process lessons)

- **Trigger:** the end of every run.
- **Test:** does the debrief answer: "did any row get a false VERIFIED, and which verification primitive would have caught it earlier?"
- **Action:** capture the process lesson, not only the bug list. A debrief that logs 4 tactical bugs and zero methodology holes has missed the point. Feed the answer back as a gate/checklist candidate — then prove it can fail (CB-7).

## R11 — oracle-provenance (no self-graded green)

- **Trigger:** any run whose cases were not authored 1:1 from a plan-it Test Contract.
- **Test:** does every verdict row carry an `AUTHORED` | `DERIVED` tag classifying where its *expected outcome* (the oracle) originates — and is no DERIVED-oracle green labelled VERIFIED-against-plan?
- **Action:** run the FR1.5 no-contract ladder (locate → derive → confirm → label → persist). **AUTHORED** = the oracle traces to a pre-build authored source (plan-it Test Contract / DoDs / goals, external spec, PR/issue description). **DERIVED** = the expected value was reconstructed from the implementation/diff itself. Deriving *cases* around an AUTHORED oracle (expanding a goal) stays AUTHORED; deriving the *expected value* from the code is DERIVED, needs human confirm (or a `DERIVED-UNCONFIRMED` run stamp under autonomy), and its green means only "self-consistent" — never "obeys the plan" (CB-9). Unanchored cases go to the accepted-gaps register — no silent caps.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
