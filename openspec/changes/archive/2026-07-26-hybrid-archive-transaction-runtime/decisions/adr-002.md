# ADR-002: Pure plan validator with an injected filesystem snapshot

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

`archive-plan-contract` requires hash and reference validation, but the pure validator
must not perform I/O beyond reading the plan bytes (REQ-archive-plan-contract-001).

## Decision

`archive-plan.js` exposes `validatePlanAgainstSnapshot(plan, snapshot)`, where `snapshot`
is a plain object of already-computed SHA-256 digests and inventory paths built by
`archive-transaction.js`. The validator never requires `fs` and never throws.

## Alternatives

- Validator reads the filesystem itself — two I/O owners, fixture-heavy unit tests.
- Runtime-only validation without a separate module — no reusable, testable contract.

## Consequences

Every rejection code becomes unit-testable with plain objects, mirroring the
`result-envelope.js` validator style, and the runtime stays the single auditable I/O
owner. The snapshot shape becomes part of the module's public contract.
