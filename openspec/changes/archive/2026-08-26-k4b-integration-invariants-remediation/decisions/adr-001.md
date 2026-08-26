# ADR-001: Derive WorkOrder capsule inputs from snapshot-bound inventory

- Status: proposed
- Change: k4b-integration-invariants-remediation
- Date: 2026-08-26

## Context

WorkOrder v2 needs concrete capsule inputs, while SourceSnapshot v1 intentionally carries no file inventory and ExecutionGraph nodes currently expose `allowed_paths`, often as globs.

## Decision

`compileWorkOrdersV2` resolves each node's `allowed_paths` against an optional compile-context inventory bound to the graph's `source_snapshot_id`. Concrete paths may resolve without inventory; unresolved globs, empty results, malformed paths, or provenance mismatch fail the whole compilation before emission. The result participates in WorkOrderId.

## Alternatives

- Copy `allowed_paths`: rejected because globs are not materializable file identities.
- Extend SourceSnapshot v1: rejected because it changes a frozen identity contract.
- Let K6a discover files: rejected because WorkOrderId would not bind the capsule.

## Consequences

K4a owns deterministic capsule scope and K6a receives a closed manifest. Callers compiling glob-scoped nodes must provide a snapshot-bound inventory, and existing WorkOrderIds/fixtures change.
