# ADR-002: Cryptographic Binding Recompute And Signature Change

- Status: proposed
- Change: k3-identities-boundary-closure
- Date: 2026-08-07

## Context
`validateWorkOrderBinding(workOrder)` only checks that `source_snapshot_id` looks like sha256. `validateWorkResultBinding` compares declared ID strings. Spoofed declared IDs with mutated canonical payloads can pass.

## Decision
Adopt `validateWorkOrderBinding(sourceSnapshot, workOrder)` and keep `validateWorkResultBinding(workOrder, workResult)`. Both MUST recompute digests via `computeSourceSnapshotId` / `computeWorkOrderId` / `computeWorkResultId` and compare to declared IDs; mismatch fails closed.

## Alternatives
- Keep one-arg WorkOrder binding — rejected; cannot recompute snapshot digest.
- Optional recompute flag — rejected; fail-open by default.

## Consequences
In-repo callers (tests today) must pass the snapshot object. Binding success becomes cryptographically bound to payload content, not string equality alone.
