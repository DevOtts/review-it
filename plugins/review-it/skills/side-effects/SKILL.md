---
name: side-effects
description: Third-party side-effect verification — the Airtable failure class, first-class. Verifies that writes to external systems (Airtable, Slack, Shopify, CRMs, payment providers) actually landed, by reading the record back from the target system's OWN surfaces — API GET for field values AND the UI render for display semantics — with read-back stability (2–3 reads) and real-target coverage. Invoked by /review-it when a DoD includes third-party writes, or standalone when the user says "verify the write landed", "check the Airtable/Slack/Shopify record", "did the integration actually save it". A write verified only by sender-side success is not verified.
version: 1.0.0
license: MIT
author: DevOtts
author_url: https://github.com/DevOtts
homepage: https://github.com/DevOtts/review-it
repository: https://github.com/DevOtts/review-it
keywords: [side-effects, third-party, write-verification, airtable-class, read-back, qa]
---

# /side-effects — third-party write verification

You verify that a write to an external system **landed as a human will see it** — not that our side believes it was sent. The canonical failure this mode exists for: an Airtable record whose every API GET looked correct while the record rendered *empty* in Airtable's own UI, because the write missed the primary field. Sender-side success is the wrong layer (gate R1).

Gates applied here: **R1 wrong-layer**, **R3 read-stability**, **R5 directive-lookup**, **R6 narration≠evidence** — full specs in `references/gate-catalog.md`; statuses in `references/vocabularies.md`; report rows per `references/report-format.md`.

## Step 1 — Inventory the write surface

For each third-party write in the DoD/contract row:
1. Name the target system, entity/table, and the REAL destination (not only a scratch/sandbox twin — FR5.3: the real target's constraints, primary fields, required columns are part of the assertion).
2. Name both read-back surfaces: the API read (endpoint, auth plane) and the UI surface (page/view a human checks), when both exist.
3. Credentials: apply gate R5 — grep the standing rulings and use the incumbent pattern; never propose a new storage location. Authenticated real-browser read-backs route to `fable-it:chrome-cdp-control` (per-write confirmation gate intact); API read-backs run under the project's existing integration credentials.

## Step 2 — Read back from BOTH surfaces (R1)

- **API GET** — fetch the written record; assert field values against the oracle (expected values from the contract/DoD — carry the row's AUTHORED|DERIVED tag per R11).
- **UI render** — load the target system's own UI on that record and assert display semantics: the primary/display field renders, computed columns populated, the record is findable in the view a human uses. UI verification routes to `fable-it:full-qa` / CDP execution — this mode owns *what* must be proven, not the browser mechanics (CB-3).
- Either surface alone is insufficient when both exist: **API-only ⇒ `INV-in-UI`**, UI-only ⇒ INV with blocker `api-unread`. When the system genuinely has no UI, record that fact in the row (structural) and API read-back may stand alone.

## Step 3 — Stability before verdict (R3)

Any unexpected read-back (null, empty, missing field) ⇒ 2–3 re-reads with short backoff before any verdict, **raw sequence logged** into the evidence ledger (e.g. `read1=null → read2=populated → read3=populated`). A single read is never evidence; a null never proves a regression — prove the positive.

## Step 4 — Verdict rows

Emit one row per write per `references/report-format.md`: ledger-backed status (`PASS` / `FAIL` / `INV-in-UI` / INV+blocker), oracle tag, and the read sequence quoted. Delegated executor claims ("row saved") are provisional until re-derived here at the record of truth (R6).

## What NOT to do

- Do not accept sender-side evidence (2xx from our API, queue ack, our DB row) as landing proof — wrong layer (R1).
- Do not verify only in a scratch base/table when the DoD targets a real one (FR5.3).
- Do not inline CDP/browser logic or QA loops — route to `fable-it:chrome-cdp-control` / `fable-it:full-qa` / `fable-it:iterate` by name (CB-3).
- Do not declare a false regression off one null read (R3).

---
_Authored by [DevOtts](https://github.com/DevOtts)._
