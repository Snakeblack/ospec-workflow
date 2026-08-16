# ADR-005: Explicit Fail-Closed sourceSnapshotId Validation

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
When `sourceSnapshotId` was passed as an explicit empty string `""` or invalid identifier into `compileExecutionGraph`, existing logic fell back to `contract.source_snapshot_id` or `sourceSnapshot.source_snapshot_id`. This silent fallback masked caller bugs and allowed execution against unintended repository revisions.

## Decision
Enforce explicit fail-closed validation: if `sourceSnapshotId !== undefined`, validate its format against `^sha256:[a-f0-9]{64}$` immediately. If empty or invalid, throw `invalid-source-snapshot-id` fail-closed without any fallback to contract or object properties.

## Alternatives
- Fallback chain `sourceSnapshotId || contract.source_snapshot_id`: rejected because explicit empty arguments must not silently succeed with implicit defaults.
- Warn on empty string but proceed with contract fallback: rejected because security boundaries require fail-closed semantics.

## Consequences
- Easier: Prevents inadvertent snapshot substitution and ensures callers receive immediate feedback on bad parameters.
- Harder: Callers passing invalid snapshot variables fail immediately rather than silently falling back.
- Reversibility: High; strict parameter validation is safe and predictable.
