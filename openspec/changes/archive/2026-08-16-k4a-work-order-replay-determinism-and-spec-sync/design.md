# Technical Design: K4a WorkOrder Replay Determinism and Spec Sync

## Architecture Overview

```
ExecutionGraph (GraphId)
        │
        ▼
compileWorkOrdersV2(graph)  ──[context: role="repair-worker", budget=DEFAULT_WORK_ORDER_BUDGET]──> WorkOrders (WorkOrderId)
        │                                                                                                  │
        ▼                                                                                                  ▼
replayExecutionGraph(graph, fixtures) <──[fixtures: graph_id === GraphId, work_order_id === WorkOrderId]───┘
```

1. **WorkOrder Compilation Determinism**:
   - `compileWorkOrdersV2(graph, context)` rejects non-default `role`, `budgets`, or `defaultBudget` with `unsupported-compilation-context`.
   - `role` is fixed to `"repair-worker"` and `budget` is fixed to `DEFAULT_WORK_ORDER_BUDGET`.
   - Every WorkOrder emitted is 100% reproducible by `replayExecutionGraph(graph)`.

2. **Replay Engine Legacy Segregation**:
   - `replayExecutionGraph` no longer accepts `options.allowLegacyFixtures`. Canonical replay is 100% strict.
   - `replayLegacyFixtureGraph` remains the dedicated export for legacy fixture evaluation.

3. **Canonical Spec Sync**:
   - `openspec/specs/execution-graph-compiler/spec.md` updated to encompass all strict provenance, obligation authority, shadow semantics, schema authority, and compilation determinism requirements.

4. **Schema Authority Model**:
   - `schemas/kernel/execution-graph/v1.schema.json` is the sole canonical authoritative schema for ExecutionGraph and GraphNode in K4a with `minLength: 1`.
   - `schemas/kernel/graph-node/v1.schema.json` is documented as the frozen K1 compatibility pin.
