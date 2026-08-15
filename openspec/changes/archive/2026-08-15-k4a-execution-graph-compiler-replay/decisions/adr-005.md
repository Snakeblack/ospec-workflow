# ADR-005: WorkOrder v2 as the K4a Public Compilation Contract

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
WorkOrder v1 is a frozen K1 contract whose schema digest and fixtures must remain byte-identical. K4a needs required SourceSnapshot provenance, an explicit kind discriminator, and complete semantic node bindings without disguising those additions as a v1-compatible change.

## Decision
Add `compileWorkOrdersV2` and export `compileWorkOrders` as its K4a public alias. Keep `compileWorkOrdersV1` as an explicit legacy-only export conforming to the restored v1 schema. Publish and validate v2 through `schemas/kernel/work-order/v2.schema.json`, the distinct `work-order-v2` manifest/claims entries, v2 fixtures, and a `work-order/v2` ID domain; never retarget a K1 pin.

## Alternatives
- Extend v1 and update its K1 pin: rejected because it erases detection of historical contract drift.
- Overload one compiler with a version option: rejected because omitted or invalid options create an ambiguous downgrade path.
- Remove the v1 export: rejected because explicit legacy consumers can remain compatible without affecting new K4a output.

## Consequences
New K4a compilation is unambiguously v2 and fails closed without exact SourceSnapshot provenance. Legacy v1 validation and imports remain available but receive no new fields. Two API/schema families require separate fixtures and tests; rollback of K4a selection is cheap, while the restored K1 baseline remains immutable.
