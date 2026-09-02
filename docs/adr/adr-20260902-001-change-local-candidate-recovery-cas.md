# ADR-001: Change-local Candidate recovery CAS

- Status: proposed
- Change: verify-lineage-candidate-persistence
- Date: 2026-09-01

## Context

Verify lineage needs exact Candidate bytes after a process restart, while canonical `candidate_id` must remain the sole code identity and no new authority store may be introduced.

## Decision

Persist canonical Candidate JSON under `.verify-lineage/candidates/sha256/<hex>.json` inside the OpenSpec change. The SHA-256 of exact bytes determines the path; lineage state holds the only usable reference and binds it to `candidate_id`.

## Alternatives

- Inline Candidate in `state.yaml`: rejected because it conflates mutable workflow state with immutable recovery bytes.
- Global/authority-store CAS: rejected because it introduces a competing lifecycle dependency.
- Blob discovery by CandidateId: rejected because discovery would make the blob directory an authority index.

## Consequences

Candidate material archives with the change and is independently integrity-checkable. Orphan blobs may remain after crashes but are inert. Reversal is cheap: references and blobs can remain unread without changing lineage identity.
