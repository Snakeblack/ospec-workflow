# ADR-004: Fail-Closed Type Non-Aliasing and Mutable Target Rejection

- Status: proposed
- Change: k3-identities-candidate-freeze
- Date: 2026-08-07

## Context
Treating unapproved worker outputs (`WorkResult`) as frozen candidates, or issuing evaluation attestations / delivery authorizations against mutable git branches (`main`, working directory paths) destroys the provenance and auditability invariants of the kernel.

## Decision
The kernel enforces strict type discriminators across schema families. Schema validators and runtime type guards fail closed if `WorkResult` is supplied where `Candidate` is required, or if `Candidate` is supplied where `CandidateEvaluationAttestation` or `DeliveryAuthorization` is required. Furthermore, attestations and authorizations are forbidden from binding to mutable branches or unintegrated paths.

## Alternatives
- Loose duck-typing or soft warnings on type mismatch: Rejected because unintegrated outputs could bypass freeze verification and reach delivery.
- Allowing branch name references in attestations: Rejected because branch state changes mutably, breaking content-addressing guarantees.

## Consequences
- Requires workers to explicitly freeze integrated results into `Candidate` records before verification.
- Enforces content-addressed immutability across the entire verification and attestation lifecycle.
