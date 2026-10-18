# DECISIONS

## 2026-10-18 review-it to status-write wiring

- D-01 [tests] Default: add `node --test` + `node --check`. `git ls-files` shows no versioned runner or package.json. Recommendation: keep it; run `node --test plugins/review-it/tests`. Tests skip (not fail) when status-write.mjs is not found; set STATUS_WRITE to point at it.
- D-02 [evidence] Default: the sync script cuts one `verdict-<TASK>.md` per PASS task beside the report instead of passing the report itself as `--evidence`. Why: the writer refuses a file with any non-PASS `verdict:` line, and a multi-task report has both. Recommendation: keep; the full report is linked from the verdict file (`report:` line).
- D-03 [report format] Default: new additive section 2c "Task results" (`task:` / `verdict:` / `note:` blocks) is how tasks are mapped to cases. Recommendation: build-it/plan-it should name tasks the same way in the contract so cases carry their task id.
- D-04 [writer location] Default: resolved from `--writer`, `STATUS_WRITE`, then `~/Workspace/Devotts/build-it/...`. Recommendation: when build-it ships the writer inside the installed plugin, point the default there.
- D-05 [scope] Root `SKILL.md` is a symlink to the plugin SKILL.md, so one edit covers both. No version bump, per instructions.
