# execution-graph-compiler Delta Specification

## Purpose

Update the `execution-graph-compiler` specification to enforce deterministic WorkOrder v2 compilation, strict legacy replay segregation, absolute obligation authority, strict replay fixture provenance, and semantic schema authority.

## Added & Modified Requirements

### Requirement: Deterministic WorkOrder v2 Compilation And Replay Reproducibility {#REQ-execution-graph-compiler-005}

`compileWorkOrdersV2()` MUST be a strictly deterministic pure function of the `ExecutionGraph` and its validated `SourceSnapshot`. In K4a, all WorkOrders emitted MUST use canonical `role: "repair-worker"` and `DEFAULT_WORK_ORDER_BUDGET`.

If compilation context attempts to supply variable `role` (other than `"repair-worker"`), variable `budgets`, or `defaultBudget`, `compileWorkOrdersV2()` MUST fail closed immediately with error code `unsupported-compilation-context`.

Every WorkOrder emitted by `compileWorkOrdersV2()` MUST be 100% reproducible by `replayExecutionGraph()` without requiring out-of-band context.

#### Scenario: Canonical WorkOrders are 100% reproducible by Replay
- GIVEN a valid ExecutionGraph compiled for a Repair route
- WHEN `compileWorkOrdersV2(graph)` generates WorkOrders
- AND a fixture is recorded declaring `graph_id: graph.graph_id` and `work_order_id: wo.work_order_id`
- WHEN `replayExecutionGraph(graph, fixtures)` executes
- THEN Replay MUST accept the fixture and complete the node without false-positive provenance rejection

#### Scenario: Unbound role or budget overrides fail compilation fail-closed
- GIVEN compilation context supplying `role: "specialized-repair-worker"` or custom `budgets`
- WHEN `compileWorkOrdersV2(graph, context)` is invoked
- THEN compilation MUST fail closed with error code `unsupported-compilation-context`
- AND zero WorkOrders MUST be emitted

### Requirement: Strict Replay Fixture Provenance And Legacy Segregation {#REQ-execution-graph-compiler-006}

The canonical `replayExecutionGraph()` function MUST strictly enforce that every recorded fixture object declares non-empty `graph_id` matching `graph.graph_id` and `work_order_id` matching the deterministically compiled WorkOrder's `work_order_id`. Any missing, empty, or mismatched `graph_id` or `work_order_id` MUST be rejected with `stale-fixture-rejected`.

Canonical `replayExecutionGraph()` MUST NOT accept legacy unpinned fixtures or bypass flags. Legacy unpinned fixtures MUST be processed exclusively through the dedicated `replayLegacyFixtureGraph()` function.

#### Scenario: Replay rejects fixture with mismatched or missing work_order_id
- GIVEN a fixture with missing or mismatched `work_order_id`
- WHEN `replayExecutionGraph()` is invoked
- THEN replay MUST throw `stale-fixture-rejected` fail-closed

#### Scenario: Legacy unpinned fixtures are rejected by canonical replay and accepted by replayLegacyFixtureGraph
- GIVEN a legacy fixture omitting `graph_id` and `work_order_id`
- WHEN passed to `replayExecutionGraph()`
- THEN replay MUST throw `stale-fixture-rejected`
- WHEN passed to `replayLegacyFixtureGraph()`
- THEN legacy replay MUST proceed with compatibility evaluation
