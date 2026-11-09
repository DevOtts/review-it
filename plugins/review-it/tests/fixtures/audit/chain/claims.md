# Claim ledger: chain fixture

Author model: claude-sonnet-5-5
Read 2026-11-06 at review-it `eed4dec`.

| ID | Claim | Tier | Source |
|---|---|---|---|
| C1 | review-it's plugin manifest says version 2.1.1 | code | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |
| C2 | status-sync finds the writer through `STATUS_WRITE` | code | review-it@eed4dec:plugins/review-it/scripts/status-sync.mjs:104-106 |
| C3 | The review-it SKILL frontmatter says version 2.1.1 | git | review-it@eed4dec:plugins/review-it/skills/review-it/SKILL.md:4 |
| C4 | The repository is MIT licensed | durable-doc | review-it@eed4dec:LICENSE:1 |
| C5 | The worktree was clean when read | local | `git status --short` → empty, 2026-11-06 |
