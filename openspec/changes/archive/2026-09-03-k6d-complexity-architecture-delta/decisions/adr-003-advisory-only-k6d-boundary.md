# ADR-003: Advisory-Only K6d Boundary

- Status: proposed
- Change: k6d-complexity-architecture-delta
- Date: 2026-08-31

## Context

K6d heuristics must surface possible overengineering for later review, but K7
review authority, K8 attestation, K9 promotion, delivery, and CX0 telemetry are
separate slices with different authorities.

## Decision

Separate deterministic fact calculation from advisory signal generation. The
report fixes `authority: advisory`, excludes decision and transition fields, and
exports an unconditional `rejectAuthorityMisuse` guard. K6d imports no lifecycle,
review, attestation, promotion, delivery, or CX0 module.

## Alternatives

- Emit approve/reject recommendations: rejected because heuristics would become a gate.
- Feed K6d into verifier verdicts: rejected because verification authority is K6b.
- Require CX0 coverage: rejected because context telemetry is orthogonal and optional.

## Consequences

K7/K9 can later consume the report as input without inheriting authority from it.
Current lifecycle remains unchanged. Promoting a signal later requires a distinct
specified change rather than relaxing this boundary implicitly.
