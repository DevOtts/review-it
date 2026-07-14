# Derived Test Contract — src/csv.mjs

> **Provenance: DERIVED · Run stamp: DERIVED-UNCONFIRMED (R11).**
> No plan-it Test Contract, PRD, epic, issue, or README existed in this repo.
> The FR1.5 no-contract ladder ran locate → (nothing) → **derive** → confirm
> (no human available; autonomous) → label → persist (this file).
> Expected values below were reconstructed **from the implementation itself**.
> Every green means **"self-consistent"**, NEVER "obeys the plan" (CB-9).
> This file is promotable: plan-it can absorb it and re-anchor the oracles to
> an authored spec, at which point rows can graduate from DERIVED to AUTHORED.

## Surface under test
- `src/csv.mjs` — two pure functions, no I/O, no third-party, no UI.
  - `parseRow(line)` — `split(",")` then `.trim()` each cell.
  - `toRecord(header, line)` — zip header→cells, missing cell → `""`.
- Test-type selection (authoring-standards §2): **pure logic** → enumerated
  cases + one property invariant. TYPE=`unit`, PERSISTENCE=`script-persisted`
  (committed at `qa/derived.test.mjs`, Tier 0: deterministic + service-free).

## Cases
| ID | TYPE | Oracle | Given / When | Then (DERIVED expected) |
|----|------|--------|--------------|-------------------------|
| D-01 | unit | DERIVED | `parseRow("a,b,c")` | `["a","b","c"]` |
| D-02 | unit | DERIVED | `parseRow(" a , b ,c ")` | `["a","b","c"]` (trimmed) |
| D-03 | unit | DERIVED | `parseRow("a,")` | `["a",""]` |
| D-04 | unit | DERIVED | `parseRow("")` | `[""]` |
| D-05 | unit (property) | DERIVED | quote-free lines | `cells === commas+1` |
| D-06 | unit | DERIVED | `toRecord(["id","name"],"1,bob")` | `{id:"1",name:"bob"}` |
| D-07 | unit | DERIVED | `toRecord(["id","name","email"],"1,bob")` | `{...,email:""}` |
| D-08 | unit | DERIVED | `toRecord(["id"],"1,extra")` | `{id:"1"}` (extra dropped) |
| D-09 | unit | DERIVED | `toRecord([],"a,b")` | `{}` |
| D-10 | unit / external-anchor candidate | DERIVED | `parseRow('"a,b",c')` | `['"a','b"','c']` (naive split) |

## Coverage map
- `parseRow` → D-01..D-05, D-10
- `toRecord` → D-06..D-09

## Accepted-gaps register (no silent caps)
- **RFC-4180 quoting (D-10).** The module splits naively, so a quoted field
  `"a,b"` becomes two cells. Against the external candidate oracle RFC 4180
  this is a defect (should be one field). But **no authored contract states
  this module must be RFC-4180 compliant** — it may intentionally be a simple
  splitter. Grading it FAIL would itself be inventing an oracle. Routed here
  as a **human-confirm question**, not a verdict.
- **No negative/authz/error cases.** `parseRow(null)` etc. throw; with no spec
  defining desired error behavior, error-path expectations are unanchored.

## CB-7 proof
A deliberately-wrong expectation (`parseRow("a,b,c") === ["WRONG"]`) was run
against the same harness and produced `FAIL` / exit 1 — the harness can go red.
