# ADR-002: Additive K6d Contract Families

- Status: proposed
- Change: k6d-complexity-architecture-delta
- Date: 2026-08-31

## Context

Reports and alternatives need stable identities, independent validation, and
cross-family rejection without modifying frozen K1 or K6b schemas.

## Decision

Publish closed `architecture-alternative/v1` and
`complexity-architecture-delta/v1` families. Both are Candidate-bound and
content-addressed; report bytes are the UTF-8 `stableSerialize` output. Register
both in the kernel manifest and claims catalog using only supported schema
keywords.

## Alternatives

- One unversioned envelope: rejected because consumers cannot pin it.
- Reuse evidence or verification kinds: rejected because K6d is not evidence authority or verdict.
- Free-form embedded alternatives: rejected because rationale could evade validation.

## Consequences

Consumers can validate or persist either record and substitution fails by kind.
The added schema surface and fixtures roll back cleanly, but a future incompatible
shape requires v2 rather than mutating v1.
