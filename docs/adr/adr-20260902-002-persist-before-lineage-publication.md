# ADR-002: Persist before lineage publication

- Status: proposed
- Change: verify-lineage-candidate-persistence
- Date: 2026-09-01

## Context

Candidate blobs and `state.yaml` cannot be committed in one filesystem transaction, yet a durable lineage must never newly reference unpublished bytes.

## Decision

Publish and re-read the immutable Candidate blob before returning a lineage that references it. The caller then atomically writes `state.yaml`. Apply the same order to remediation successors before advancing `current_candidate_id`.

## Alternatives

- State first, blob second: rejected because a crash creates a dangling authoritative reference.
- Two-phase transaction journal: rejected as unnecessary authority and recovery complexity.
- Inline both in one state write: rejected because it abandons content-addressed recovery records.

## Consequences

Crashes may produce only inert orphan blobs; retry is idempotent and safe. Callers must preserve the ordering contract. Full multi-file atomicity is unnecessary, but tests must cover every boundary.
