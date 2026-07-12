# Tasks: Codex Agent Delegation Depth

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-codex-target-002 / TOML output path | MUST | `codex.js`, `target-transform.js`, generated fixtures | covered-by-design | Existing TOML flow extended. |
| REQ-codex-target-002 / recursive delegation | MUST | Profile setting, serializer, unit/smoke assertions | covered-by-design | Native TOML table follows instructions. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~70-120 plus documentation |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Checklist Status Legend

- `[ ]` Not implemented or not verified.
- `[x]` Present in the inspected delivery diff; final suite verification is tracked separately.

## Phase 1: Completed Delivery Diff

- [x] 1.1 Add `agentSettings.max_depth = 1` to `scripts/lib/target-profiles/codex.js`. [REQ-codex-target-002]
- [x] 1.2 Carry settings through `handleAgentToml` and serialize a typed `[agents]` table in `scripts/lib/target-transform.js`. [REQ-codex-target-002]
- [x] 1.3 Add the transform unit assertion and update Codex golden agent fixtures. [REQ-codex-target-002]
- [x] 1.4 Make constrained TOML test parsers accept a settings table after multiline instructions; assert depth in the Codex smoke. [REQ-codex-target-002]
- [x] 1.5 Route `sdd-orchestrator` to `default` in `models.yaml`.
- [x] 1.6 Bundle `docs/testing/codex-mcp-idempotency.tdd.md` as historical TDD evidence only; do not add MCP normative requirements.

## Phase 2: Verification and Delivery

- [x] 2.1 Run `npm test`; record the full result and any platform-specific failure before committing. [REQ-codex-target-002]
- [x] 2.2 Review the final diff to exclude `.claude/` and `.codex/` local configuration; include the user-approved historical archive move as a separate atomic commit.
- [ ] 2.3 Commit the scoped change on a new branch, open the PR, wait for required GitHub CI, merge only on success, then create the release.
