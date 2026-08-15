# ADR-001: Topological WorkOrder v2 Compilation with Canonical WorkOrderId Dependency Digests

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
ExecutionGraph nodes declare coarse semantic dependencies as raw string node IDs, whereas K3 execution identities require `WorkOrder` dependencies to contain valid cryptographic `WorkOrderId` SHA-256 digests (`sha256:<64 hex>`). Emitting raw string node IDs breaks cryptographic interoperability with `computeWorkOrderId` and `validateWorkOrderBinding`.

## Decision
Topologically sort graph nodes in `compileWorkOrdersV2` and resolve each node's semantic dependencies by mapping upstream `node_id` entries to their computed canonical `WorkOrderId` SHA-256 digests. Enforce the `^sha256:[a-f0-9]{64}$` item pattern in `work-order/v2.schema.json`.

## Alternatives
- Raw string node IDs in WorkOrder v2 dependencies: rejected because it violates K3 schema constraints and breaks cryptographic binding recomputation.
- Post-compilation two-pass hashing: rejected because downstream WorkOrder preimages depend directly on upstream WorkOrder SHA-256 digests.

## Consequences
- Easier: Full cryptographic interoperability with K3 kernel identity validators (`validateWorkOrderBinding`).
- Harder: Cyclic dependencies or unresolvable prerequisite orders trigger immediate fail-closed compilation errors.
- Reversibility: Low; foundational for kernel cryptographic execution pipelines.
