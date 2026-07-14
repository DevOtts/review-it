# Draft QA report — segment-filters feature (fixture)

Preflight (R9): repo=fixture branch=main@abc1234 app=filters-demo checkout=clean
Oracle: AUTHORED (DoD item 3) · Contract: inline DoD

## Verdict rows
| Case | Oracle | Status | Evidence (ledger ref) |
|------|--------|--------|-----------------------|
| DOD-3 "After segment reset, the panel shows a single filter row (Status is Active)" | AUTHORED | PASS | screenshot `screenshots/filters-after-reset.png` — panel shows the single Status filter row |

## Evidence ledger
| ts | criterion | command | quoted output | verdict |
|---|---|---|---|---|
| 2026-07-14T20:11:02Z | DOD-3 | CDP screenshot → screenshots/filters-after-reset.png | "screenshot captured, panel rendered" | PASS |
