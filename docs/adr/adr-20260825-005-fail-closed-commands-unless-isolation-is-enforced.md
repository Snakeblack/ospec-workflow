# ADR-003: Fail-Closed Commands Unless Isolation Is Enforced

- Status: proposed
- Change: k6a-isolation-frontier-hardening
- Date: 2026-08-25

## Context
REQ-008 prose still allowed command execution under `partial` / `instructional` / `unavailable` via local subprocess fallback, provided the runtime did not report `enforced`. `executeWorkOrder` already refuses command lists without `enforced`. Spec/runtime drift is P1; documented fallback would re-open unisolated commands.

## Decision
Command dispatch through `ExecuteWorkOrder` fails closed unless `isolationReported` is `enforced` on a matching `WorkerTransport`. `partial` / `instructional` / `unavailable` MUST refuse commands and MUST NOT record `enforced`. Non-command K6a primitives (workspace lifecycle, materialization, path validation, result capture) MAY complete under the software boundary without claiming `enforced`. Keep invariant id `inv-k6a-host-isolation-fallback` with these semantics.

## Alternatives
- *Restore documented command fallback*: Rejected; that is the REQ-008 drift and an unisolated subprocess path.
- *Fail-closed all K6a primitives without `enforced`*: Rejected; would block workspace create/dispose and result capture on partial hosts.
- *Require an OS jail for `enforced`*: Rejected by architecture-001.

## Consequences
Partial hosts cannot run work-order commands until they demonstrate WorkerIsolation on the executing transport. Non-command paths keep working. Invariant id is stable; checkers and E2E must assert refuse-commands, not fallback-execute. Reversible only by reintroducing a fallback the spec now forbids.
