# ADR-002: Independent policy-driven verifier

- Status: proposed
- Change: k6b-verifier-evidence-assurance-graph
- Date: 2026-08-27

## Context

A worker emits `WorkResult` and narrative before K4b integrates and K3 freezes a Candidate. Verification must independently decide whether Candidate-bound evidence satisfies Execution Graph obligations.

## Decision

Implement a pure verifier that accepts only canonical Candidate v2 plus contract, Execution Graph, repository bytes, and raw evidence. A closed policy table selects one declared strategy or the Strict TDD fallback, then evaluates minimums, negatives, provenance, bindings, and staleness before emitting a separate verification record.

Strict TDD fallback is strategy selection only. It does not mutate `openspec/config.yaml`, and an equivalence manifest cannot disable it.

## Alternatives

- Trust worker narrative or WorkResult as subject: rejected because producer and verifier would share authority.
- Execute every check for every change: rejected because it ignores strategy-specific obligations and wastes work.
- Rewrite global `testing.tdd_mode`: rejected because verifier policy and SDD runtime configuration are separate contracts.

## Consequences

Verification becomes deterministic, testable, and fail-closed with stable reason codes. Policies require explicit maintenance as strategies evolve. ChallengePlan, review, attestation, and delivery remain outside this component.
