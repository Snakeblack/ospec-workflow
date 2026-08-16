# Tasks: K4a WorkOrder Replay Determinism and Spec Sync

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

## Implementation Tasks

- [x] 1. Hardening WorkOrder Compilation Determinism (`work-order-compiler.js`)
  - [x] 1.1 Enforce fixed canonical `role: "repair-worker"` and `DEFAULT_WORK_ORDER_BUDGET` in `compileWorkOrdersV2`.
  - [x] 1.2 Reject unlinked `role` (if not "repair-worker"), `budgets`, or `defaultBudget` with `unsupported-compilation-context`.
  - [x] 1.3 Add unit tests verifying determinism and rejection of unlinked compilation context.

- [x] 2. Segregate Replay Legacy Option (`replay-engine.js`)
  - [x] 2.1 Remove `allowLegacyFixtures` option support from canonical `replayExecutionGraph()`.
  - [x] 2.2 Retain `replayLegacyFixtureGraph()` as the sole explicit legacy runner.
  - [x] 2.3 Add test ensuring canonical `replayExecutionGraph()` rejects legacy fixtures even if options are passed.

- [x] 3. Synchronize Active Canonical Spec (`openspec/specs/execution-graph-compiler/spec.md`)
  - [x] 3.1 Update REQ-001 (obligation authority, `minLength: 1`, `unknown-obligation-id`).
  - [x] 3.2 Update REQ-005 (deterministic WorkOrder compilation, rejection of unlinked context).
  - [x] 3.3 Update REQ-006 (mandatory `graph_id` + `work_order_id` in replay, legacy segregation).
  - [x] 3.4 Update REQ-007 (shadow comparator full-match vs partial-match on skipped dimensions).
  - [x] 3.5 Clarify schema authority model for `execution-graph/v1` vs frozen `graph-node/v1`.

- [x] 4. Test Suite and Evidence Verification
  - [x] 4.1 Add composition test: `WorkOrder compiler -> Replay` round-trip.
  - [x] 4.2 Verify all 2292 tests pass and target distributions validate cleanly.
  - [x] 4.3 Generate `verify-report.md` with complete cryptographic digests and audit trail.
