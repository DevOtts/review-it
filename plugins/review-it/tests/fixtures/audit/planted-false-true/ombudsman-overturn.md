# Ombudsman (scripted: overturns P3)

model: claude-opus-5-5
tokens: 2100

| ID | Ruling | Reason |
|---|---|---|
| P1 | UPHELD | |
| P2 | UPHELD | |
| P3 | FALSE | `git cat-file -e eed4dec:qa/fixtures/no-plan/qa/derived.test.mjs` fails: deleted in b8b4a3c; the auditor cited ca86985, an older commit |
| P4 | UPHELD | |
