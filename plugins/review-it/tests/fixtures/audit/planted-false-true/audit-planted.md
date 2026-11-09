# Audit (PLANTED: P3 is a false TRUE)

P3 cites a file that does not exist at eed4dec: it was deleted in b8b4a3c ("keep ladder fixtures pristine").
The evidence below is what a careless auditor writes when it reads an old checkout or its own memory.

model: claude-haiku-5-5
tokens: 900

| ID | Verdict | Evidence |
|---|---|---|
| P1 | TRUE | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 → `"version": "2.1.1"` |
| P2 | TRUE | `git show eed4dec:plugins/review-it/scripts/status-sync.mjs` lines 104-106 |
| P3 | TRUE | review-it@ca86985:qa/fixtures/no-plan/qa/derived.test.mjs:6 → `import { parseRow, toRecord } from "../src/csv.mjs"` |
| P4 | TRUE | `git show eed4dec:LICENSE` first line "MIT License" |
