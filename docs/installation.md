# Installation

## As a Claude Code plugin (recommended)

```bash
# Add the DevOtts marketplace (once — it's shared with fable-it and plan-it)
/plugin marketplace add DevOtts/review-it

# Install the plugin
/plugin install review-it@devotts
```

This installs the front door (`/review-it`) plus the bundled `side-effects`,
`deploy-verify` and `pr-review` skills and the `references/` docs they load.

## Dependencies

- **`parallel-lifecycle`** — hard dependency for isolated parallel runs (worktrees,
  ports, browsers). Assumed installed; review-it never re-implements it.
- **fable-it's bundled specialists** (`full-qa`, `iterate`, `chrome-cdp-control`) and
  **`make-eval`** — routed to by name when present. On hosts where a routed skill is
  missing, review-it performs that phase inline following the same principle and says so
  in the report (degrade, never break).

## Manual (any SKILL.md-compatible host)

Copy `plugins/review-it/skills/` into your host's skills directory, keeping the
`references/` folder next to the skill folders — every mode resolves its gate catalog,
vocabularies and report format from there.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
