# ADR-002: Atomic Canonical Schema Validation in WorkOrder Compiler

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
Manual property checks in `compileWorkOrdersV2` allowed schema non-conformities and missing provenance properties to slip through to downstream consumers, risking provenance bypass and partial emission of invalid orders.

## Decision
Validate the entire input `ExecutionGraph` against `execution-graph/v1.schema.json` before compilation and validate every generated `WorkOrder` against `work-order/v2.schema.json` via canonical `validateInstance`. Any validation failure fails closed atomically with zero orders emitted.

## Alternatives
- Ad-hoc manual field assertions only: rejected because manual checks drift from JSON Schema specifications and miss schema edge cases.
- Partial emission on non-fatal errors: rejected because emitting a partial batch of WorkOrders corrupts pipeline atomicity.

## Consequences
- Easier: Guarantees 100% schema conformance for all emitted WorkOrders prior to runtime worker dispatch.
- Harder: Any minor schema deviation in the graph immediately aborts compilation.
- Reversibility: Easily reversible within compiler validation routines.
