# ADR-006: Canonical End-to-End Composition Pipeline (K3 -> K4a -> K6a -> K3)

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
Previous tests exercised worker execution in isolation or with partial mocked payloads, leaving integration boundaries between cryptographic identity generation (K3), execution graph compilation (K4a), worker execution containment (K6a), and cryptographic result verification (K3) unverified under canonical contracts.

## Decision
Establish a dedicated, canonical end-to-end integration test suite verifying the full pipeline:
1. K3: Compute `source_snapshot_id` via `computeSourceSnapshotId(sourceSnapshot)`.
2. K4a: Compile `ExecutionGraph` to `WorkOrder v2` with SHA-256 DAG dependencies and declarative budgets.
3. K3: Verify graph and work order bindings (`validateExecutionGraphBinding`, `validateWorkOrderBinding`).
4. K6a: Create isolated workspace (`createWorkspace`), materialize capsule with preserved baseline (`materializeSourceSnapshot`), execute command in containment (`executeWorkOrder`), and assemble canonical result with authentic unified diff (`captureWorkResult`).
5. K3: Validate cryptographic binding between WorkOrder and WorkResult (`validateWorkResultBinding`).
6. K6a: Dispose workspace cleanly and idempotently (`disposeWorkspace`).

## Alternatives
- *Unit-only testing per module*: Rejected because it fails to detect cross-boundary contract drift.
- *Mock-driven integration*: Rejected because synthetic mocks can hide non-canonical schema violations.

## Consequences
- Guarantees 100% end-to-end verification of the vertical pipeline across K3, K4a, and K6a.
- Serves as the canonical reference integration test for future execution verticals (e.g. K4b).
- Reversibility: High; implemented in `scripts/k6a-e2e-worker-isolation.test.js`.
