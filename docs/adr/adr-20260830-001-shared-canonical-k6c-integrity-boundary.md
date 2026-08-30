# ADR-001: Shared Canonical K6c Integrity Boundary

- Status: proposed
- Change: k6c-integrity-remediation
- Date: 2026-08-28

## Context
K6c records cross planner, runner, verifier, projector, and replay. Existing consumers validate different subsets and can hide duplicates or trust declared IDs.

## Decision
One shared module validates schemas, recomputes canonical plan/result identities, checks Candidate/node/strategy/PolicySnapshot bindings, and enforces exact catalog/cardinality invariants. The policy/strategy-selected K6c verifier entrypoint always requires a plan; requiredness is not caller-controlled. All K6c consumers call the shared validator before effects or approval.

## Alternatives
- Per-consumer validation: rejected because checks already drift and omit different invariants.
- Schema validation only: rejected because JSON Schema cannot prove cross-record bindings or recompute content IDs.

## Consequences
Integrity behavior becomes consistent and directly testable. The v1 contract tightening rejects legacy incomplete K6c records and requires atomic producer/consumer rollout; reverting is costly unless the whole slice is reverted.
