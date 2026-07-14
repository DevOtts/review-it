# Changelog

All notable changes to the `review-it` plugin.

## [1.0.0] — 2026-07-14

First public release — the QA front door of the DevOtts lifecycle family
(plan-it plans → fable-it builds → **review-it verifies**).

### Added
- **Front door** (`skills/review-it/SKILL.md`): mode detection (contract-qa PRIMARY ·
  side-effects · deploy-verify · pr-review SECONDARY), R9 environment-identity preflight,
  verifiability precheck, the FR1.5 **no-contract ladder** (locate → derive → confirm →
  label → persist), R11 **oracle provenance** (AUTHORED vs DERIVED — no self-graded green),
  and a routing table to the existing specialists (`full-qa`, `iterate`,
  `chrome-cdp-control`, `make-eval`, `parallel-lifecycle`) — referenced by name, never
  re-implemented.
- **Gate catalog** (`skills/references/gate-catalog.md`): the 11 rules, each
  trigger → test → action — wrong-layer, operability, read-stability, first-look,
  directive-lookup, narration≠evidence, pixels-over-prose, deploy-truth,
  environment-identity, debrief-methodology, oracle-provenance.
- **Report format** (`skills/references/report-format.md`): the single source of truth
  for the evidence-ledger row schema shared with fable-it, the report skeleton, and the
  fresh-context verifier protocol.
- **Vocabularies** (`skills/references/vocabularies.md`): TYPE × PERSISTENCE two-axis
  classification, the three-tier gate model, the closed status vocabulary
  (PASS / FAIL / INV + named blocker), the skip taxonomy, and provenance tags.
- **Authoring standards** and **CI-gate guidance** references.
- **Bundled modes**: `side-effects` (third-party write verification — the Airtable class),
  `deploy-verify` (deployed-code ladder + [REAL] re-runs + release checklist →
  READY/NOT-READY), `pr-review` (severity-tiered, evidence-cited process wrapper loading
  `.claude/review-config.md`).
- Devotts-family packaging: `devotts` marketplace manifest + plugin manifest; docs;
  22-case Test Contract (`qa/test-plan-master.md`) with committed fixtures.

### Deprecated (ecosystem moves shipped with this release)
- Standalone `~/.claude/skills/full-qa` → pointer to fable-it's bundled copy.
- Engine-Core `review-pr` skill → `.claude/review-config.md` project config + pointer.
