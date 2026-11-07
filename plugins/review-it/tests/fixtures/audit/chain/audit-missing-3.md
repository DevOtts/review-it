# Audit (fixture: C2, C3 and C5 missing)

model: claude-haiku-5-5
tokens: 800

| ID | Verdict | Evidence |
|---|---|---|
| C1 | TRUE | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |
| C4 | TRUE | `git show eed4dec:LICENSE` first line "MIT License" |
