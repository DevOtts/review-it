# Claim ledger: planted false TRUE (T-Q1-04)

Author model: claude-sonnet-5-5
Read at review-it `eed4dec` (release 2.1.1). Paths are relative to the review-it repo root.

| ID | Claim | Tier | Source |
|---|---|---|---|
| P1 | review-it's plugin manifest says version 2.1.1 | code | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |
| P2 | status-sync reads the writer path from `STATUS_WRITE` before its default | code | review-it@eed4dec:plugins/review-it/scripts/status-sync.mjs:104-106 |
| P3 | The no-plan fixture ships a derived test, `qa/fixtures/no-plan/qa/derived.test.mjs`, that imports `parseRow` from `src/csv.mjs` | code | review-it@eed4dec:qa/fixtures/no-plan/qa/derived.test.mjs:6 |
| P4 | The repository is MIT licensed | durable-doc | review-it@eed4dec:LICENSE:1 |
