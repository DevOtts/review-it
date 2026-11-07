# Claim ledger: tier fixture (T-K2-02)

Author model: claude-sonnet-5-5

| ID | Claim | Tier | Source |
|---|---|---|---|
| T1 | review-it's plugin manifest says version 2.1.1 | code | review-it@eed4dec:plugins/review-it/.claude-plugin/plugin.json:4 |
| T2 | release 2.1.1 is the commit eed4dec | git | `git log -1 --format=%h eed4dec` |
| T3 | The usage doc names the four modes, and the worktree had it on disk | durable-doc + local | review-it@eed4dec:docs/usage.md; `ls docs/usage.md`, 2026-11-06 |
