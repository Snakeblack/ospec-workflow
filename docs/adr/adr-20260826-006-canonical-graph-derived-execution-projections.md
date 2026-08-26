# ADR-003: Compare canonical graph-derived execution projections

- Status: proposed
- Change: k4b-integration-invariants-remediation
- Date: 2026-08-26

## Context

The repair-shadow comparator currently accepts ad-hoc route objects and can derive steps from operations or WorkOrderIds, making equal graphs compare differently and incomplete inputs appear valid.

## Decision

Introduce an internal canonical projection built from ExecutionGraph, Candidate, WorkResults, and graph telemetry. Steps are topological `node_id` values. The comparator requires all seven dimension keys, evaluates empty arrays, and fails closed on non-projection inputs.

## Alternatives

- Preserve permissive extraction fallbacks: rejected because they obscure missing authority.
- Compare raw orchestration objects: rejected because incidental ordering and clock fields are unstable.
- Change ExecutionGraph schema: rejected because projection is an observer adapter, not a kernel contract.

## Consequences

Shadow and baseline callers must provide graph-bound projections. Comparisons become deterministic and complete without mutating production state; clock-only telemetry remains excluded.
