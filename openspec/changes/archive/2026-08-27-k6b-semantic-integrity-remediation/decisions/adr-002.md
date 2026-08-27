# ADR-002: Ordered, non-aliased strategy evidence

- Status: proposed
- Change: k6b-semantic-integrity-remediation
- Date: 2026-08-27

## Context

A Set of roles proves neither distinct observations nor temporal order. Adding timestamps to frozen `evidence/v2` would create a new clock contract.

## Decision

Evaluate normalized evidence in `rawEvidence` list order. Within the selected strategy, one EvidenceId may bind repeatedly to one role but not to distinct semantic roles. Require RED before GREEN for Strict TDD and RED before PATCH before GREEN for bug strategy.

## Alternatives

- Keep role-set evaluation: rejected; aliasing and reversed sequences pass.
- Add persisted timestamps: rejected; mutates the frozen evidence family and introduces clock authority.
- Infer order from digests: rejected; content hashes carry no chronology.

## Consequences

Callers must provide evidence in observed sequence and use distinct observations for distinct roles. Reordering becomes semantically observable but remains cheap to correct. Schema-only four-role fixtures remain valid; combined verifier use fails closed.
