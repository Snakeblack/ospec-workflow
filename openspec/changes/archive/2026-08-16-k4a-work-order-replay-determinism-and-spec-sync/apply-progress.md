# Apply Progress: K4a WorkOrder Replay Determinism and Spec Sync

## Implementation Summary

- **WorkOrder Compilation Determinism**: Enforced fixed `role: "repair-worker"` and `DEFAULT_WORK_ORDER_BUDGET` in `compileWorkOrdersV2()`, rejecting unlinked role or budgets overrides fail-closed with `unsupported-compilation-context`.
- **Replay Engine Legacy Segregation**: Removed legacy fallback options from canonical `replayExecutionGraph()`, enforcing strict `graph_id` and `work_order_id` provenance. Segregated legacy unpinned replay to `replayLegacyFixtureGraph()`.
- **Canonical Active Spec Sync**: Updated `openspec/specs/execution-graph-compiler/spec.md` with all v2.45.4/v2.45.5 requirements (strict provenance, obligation authority, shadow semantics, schema authority, determinism).
- **Schema Authority Model**: Clarified that `schemas/kernel/execution-graph/v1.schema.json` ($defs.node) is the authoritative semantic node contract for K4a with `minLength: 1`, while `schemas/kernel/graph-node/v1.schema.json` is the frozen K1 compatibility pin.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| 1.1-1.3 | `work-order-compiler.test.js` | Unit | Unit Runner | PASS | PASS | PASS | PASS | Validated rejection of unlinked role and budgets overrides |
| 2.1-2.3 | `replay-engine.test.js` | Unit | Unit Runner | PASS | PASS | PASS | PASS | Validated canonical replay strictness and roundtrip |
| 3.1-3.5 | `openspec/specs/...` | Spec | Validator | PASS | PASS | PASS | PASS | Synchronized canonical active spec with runtime truth |
| 4.1-4.3 | `k3-k4a-integration.test.js` | Integration | CI Suite | PASS | PASS | PASS | PASS | Validated full end-to-end compiler-replay composition |
