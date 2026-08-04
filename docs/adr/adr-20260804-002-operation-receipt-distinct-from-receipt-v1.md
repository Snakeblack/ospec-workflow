# ADR-002: OperationReceipt distinct from receipt/v1

- Status: proposed
- Change: k2-1-authority-store-permits
- Date: 2026-08-04

## Context

K1 already publishes `receipt/v1` for Candidate evaluation binding. K2.1 needs a
mechanical completion artifact for permit consume. Reusing `receipt/v1` would
conflate attestation/evaluation with mutation completion.

## Decision

Publish new schema families `operation-permit/v1` and `operation-receipt/v1`
with distinct `$id`s and kind `operation-receipt/v1`. Do not alias or extend
`receipt/v1` as OperationReceipt. Receipts never satisfy attestation or delivery
gates.

## Alternatives

- Reuse `receipt/v1` with a new `kind` — high confusion risk; rejected by proposal.
- Delay receipts until K8 — leaves consume without a typed completion artifact.

## Consequences

Clear separation TransitionOffer ≠ Permit ≠ OperationReceipt ≠ attestation.
Manifest and contract suite grow by three families. Consumers must pin the new
`$id`s explicitly.
