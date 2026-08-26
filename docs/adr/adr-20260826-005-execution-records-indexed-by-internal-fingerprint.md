# ADR-002: Index execution records by internal fingerprint and CandidateId

- Status: proposed
- Change: k4b-integration-invariants-remediation
- Date: 2026-08-26

## Context

CandidateId binds lineage but the current filesystem layout uses it as a unique execution slot, preventing multiple auditable runs for the same candidate.

## Decision

Persist records in a fingerprint-keyed map and maintain a CandidateId-to-fingerprint-list secondary index in the same CAS commit. Compute the key canonically with the existing SHA-256 helper. Keep it internal to storage and return complete record sets from CandidateId queries.

## Alternatives

- Keep one record per CandidateId: rejected because it cannot represent repeated executions.
- Add an ExecutionRecordId kernel family: rejected because the four-identity chain is closed.
- Store an unindexed array: rejected because audit lookup and idempotency become linear and ambiguous.

## Consequences

Byte-identical retries are idempotent and distinct runs coexist. Both maps must stay transactionally consistent. Legacy CandidateId-keyed layouts are rejected rather than implicitly migrated.
