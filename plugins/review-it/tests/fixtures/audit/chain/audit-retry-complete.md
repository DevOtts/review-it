# Audit re-dispatch (fixture: the three missing rows)

model: claude-haiku-5-5
tokens: 300

| ID | Verdict | Evidence |
|---|---|---|
| C2 | TRUE | `git show eed4dec:plugins/review-it/scripts/status-sync.mjs` lines 104-106 |
| C3 | TRUE | review-it@eed4dec:plugins/review-it/skills/review-it/SKILL.md:4 |
| C5 | PARTIAL | `git status --short` shows the worktree clean now; not at read time |
