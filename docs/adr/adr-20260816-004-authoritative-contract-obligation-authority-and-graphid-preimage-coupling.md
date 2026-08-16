# ADR-004: Authoritative Contract Obligation Authority and GraphId Preimage Coupling

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
In previous versions, `computeGraphId()` omitted the `obligations` array from its preimage hash, allowing obligations to be altered without changing the `GraphId`. Furthermore, external caller inputs could override and downgrade contract `must` obligations to `should` or `may`, compromising change contract deliverables.

## Decision
Treat `contract.obligations` as immutable and authoritative for obligation IDs and criticality (`must` cannot be downgraded or stripped), while allowing callers only to supply `implemented_by` and `required_evidence` mappings. Incorporate `obligations` directly into the deterministic `computeGraphId()` preimage hash payload.

## Alternatives
- Exclude obligations from `GraphId`: rejected because obligations are critical semantic deliverables that must be tamper-evident.
- Allow callers full authority over obligations: rejected because caller privilege escalation could bypass mandatory deliverables.

## Consequences
- Easier: Guarantees that any obligation modification produces a distinct `GraphId` and prevents contract downgrade attacks.
- Harder: Test fixtures and graph preimages must explicitly include obligations.
- Reversibility: Low; fundamental to cryptographic contract integrity.
