# ADR-001: Strict K3 Identity Separation (WorkResult without CandidateId)

- Status: proposed
- Change: k6a-worker-isolation
- Date: 2026-08-23

## Context
K6a provides worker execution runtime primitives operating on SourceSnapshot and WorkOrder. To prevent premature candidate generation and maintain the K3 identity boundary, raw execution outputs must remain unapproved evidence distinct from Candidate records.

## Decision
K6a primitives, schemas, and fixtures strictly emit and accept `WorkResult` identified by `WorkResultId`, binding results cryptographically to `WorkOrderId` and `SourceSnapshotId`. Any emission, acceptance, or assumption of `CandidateId` in K6a is prohibited.

## Alternatives
- *Direct CandidateId emission in K6a*: Rejected because candidate generation requires downstream integration, freeze, and policy verification owned by K4b/K3.

## Consequences
Clean separation between raw execution evidence and candidate creation; K4b orchestrates freezeCandidate without execution coupling. Reversibility is low.
