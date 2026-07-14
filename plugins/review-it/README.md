# review-it

The QA front door for Claude Code. One command, a target (Test Contract, PR, feature
dir, or "staging"/"prod") — it detects the mode, proves what's under test, resolves the
oracle (authored or honestly derived), routes execution to the existing specialists, and
emits one evidence-backed report where VERIFIED is a ledger lookup.

See the repository root README for install and structure. The front door lives in
`skills/review-it/SKILL.md`; the 11-rule gate catalog and the report format shared with
fable-it live in `skills/references/`.
