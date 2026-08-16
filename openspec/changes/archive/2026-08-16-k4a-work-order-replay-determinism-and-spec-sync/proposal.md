# Proposal: K4a WorkOrder Replay Determinism, Strict Legacy Segregation, and Canonical Spec Synchronization

## Intent

Resolve the architectural blocker in K4a where variable WorkOrder compilation context (`role`, `budgets`) could cause false-positive provenance rejections during `replayExecutionGraph`, strictly segregate legacy replay to `replayLegacyFixtureGraph`, synchronize the active canonical spec `openspec/specs/execution-graph-compiler/spec.md` with all v2.45.4/v2.45.5 contracts, and clarify that `execution-graph/v1.schema.json` is the sole authoritative semantic node contract while `graph-node/v1.schema.json` remains frozen for K1 compatibility.

## Scope

- **WorkOrder Compilation Determinism**: Enforce that `compileWorkOrdersV2()` in K4a is a pure, deterministic function of the `ExecutionGraph` (and verified `SourceSnapshot`). Forbid unlinked variable `role` or `budgets` overrides (`unsupported-compilation-context`), guaranteeing 100% reproducibility in `replayExecutionGraph`.
- **Strict Legacy Segregation**: Remove `allowLegacyFixtures` from canonical `replayExecutionGraph()`, making `replayLegacyFixtureGraph()` the sole entry point for legacy unpinned fixtures.
- **Canonical Spec Sync**: Update `openspec/specs/execution-graph-compiler/spec.md` to be the single source of truth containing all strict provenance, obligation authority, shadow semantics, schema authority, and determinism requirements.
- **Schema Authority Clarity**: Formally document that `schemas/kernel/execution-graph/v1.schema.json` ($defs.node) is authoritative for K4a with `minLength: 1`, while `schemas/kernel/graph-node/v1.schema.json` is the frozen K1 compatibility pin.

## Capabilities

- `compileWorkOrdersV2` deterministically produces WorkOrders that are 100% reproducible by `replayExecutionGraph` without external compilation options drift.
- Attempts to pass unlinked `role` or `budgets` to `compileWorkOrdersV2` fail closed with `unsupported-compilation-context`.
- Canonical `replayExecutionGraph` strictly enforces `graph_id` and `work_order_id` provenance without escape hatch flags.
- Canonical active specification accurately mirrors runtime contracts and prevents regression in downstream phases.

## Risks & Mitigations

- **Risk**: Existing tests or callers passing custom budgets to `compileWorkOrdersV2`.
  - **Mitigation**: Verified via codebase grep that no callers pass custom budgets to `compileWorkOrdersV2`. Canonical K4a uses `DEFAULT_WORK_ORDER_BUDGET` and `role: "repair-worker"`; per-node governed budgets will be introduced under governance in K5.
