# Audit (fixture: every row covered)

model: claude-haiku-5-5
tokens: 1200

| ID | Verdict | Evidence |
|---|---|---|
| C1 | TRUE | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |
| C2 | TRUE | `git show eed4dec:plugins/review-it/scripts/status-sync.mjs` lines 104-106 |
| C3 | TRUE | review-it@eed4dec:plugins/review-it/skills/review-it/SKILL.md:4 |
| C4 | TRUE | `git show eed4dec:LICENSE` first line "MIT License" |
| C5 | PARTIAL | `git status --short` shows the worktree clean now; not at read time |
