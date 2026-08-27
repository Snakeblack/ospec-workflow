# ADR-003: Canonical integrity validation across graph operations

- Status: proposed
- Change: k6b-semantic-integrity-remediation
- Date: 2026-08-27

## Context

The projector coalesces contradictory canonical inputs, replay trusts assessments, and reconcile compares only graph id plus edges. Direct callers can therefore bypass facade checks or hide stored-payload tampering.

## Decision

Share deterministic canonical-input and graph-id helpers. Project rejects contradictory or unresolved digests before hashing; replay schema-validates and recomputes every assessment plus graph binding; reconcile recomputes the stored payload identity and compares the complete canonical graph.

## Alternatives

- Harden only `verifyCandidate`: rejected; direct graph APIs remain permissive.
- Compare graph id and edges only: rejected; nodes, subject, canonical inputs, and kind/schema remain unchecked.
- Trust a recomputed assessment id alone: rejected; graph/evidence/obligation bindings still need validation.

## Consequences

Project, replay, and reconcile share one fail-closed identity model. Legacy incomplete payloads fail instead of being repaired silently. The change adds validation work but no dependency or migration.
