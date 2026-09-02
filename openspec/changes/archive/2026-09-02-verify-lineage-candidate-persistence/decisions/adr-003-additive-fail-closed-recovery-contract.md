# ADR-003: Additive fail-closed recovery contract

- Status: proposed
- Change: verify-lineage-candidate-persistence
- Date: 2026-09-01

## Context

Persisted schema-v1 lineages exist with Candidate IDs only. Inventing or auto-discovering their preimages would rewrite evidence and weaken bounded remediation.

## Decision

Keep lineage schema version 1 and add optional `candidate_recovery` references. Inspection accepts ID-only state unchanged; mutable transitions require a lineage-carried reference and return structured recovery failures before mutation. Recovery verifies byte digest and canonical CandidateId.

## Alternatives

- Force schema-v2 migration: rejected because legacy preimages cannot be reconstructed safely.
- Accept caller-provided inline Candidate: rejected because it bypasses durable evidence.
- Auto-scan blobs by CandidateId: rejected because it silently fabricates authority linkage.

## Consequences

Compatibility is additive and legacy history stays readable. Old active remediations remain intentionally blocked until explicitly superseded or supplied with a valid attached reference. Reversal leaves optional fields inert.
