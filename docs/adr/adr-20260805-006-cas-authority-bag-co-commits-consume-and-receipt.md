# ADR-002: CAS authority bag co-commits consume and receipt

- Status: proposed
- Change: k2-1b-permit-issuance-atomic-consume
- Date: 2026-08-05

## Context

K2.1 consumes permits in a separate in-memory Map after successful
`compareAndSwap`, so CAS can advance state/journal while `operation_receipt` is
null. Specs require consumed status + OperationReceipt in the same winning
revision as next_state/next_journal, with in-process restart verifiability.

## Decision

Store an `authority` bag on each Authority Store subject
(`permits` + `receipts`). Permit-authorized `compareAndSwap` requires
`authorityCommit`; the bag is written in the same success path as
`inner.commit`. Incomplete commit fails closed without advancing head.
Revision digest formula stays state+journal (parent ADR-001); bag is
co-committed and exposed via `load`/`snapshot`. Issued-but-unused permits may
remain in the process-local Map until consume.

## Alternatives

- Keep post-CAS Map as sole consume truth — dual authority; rejected by specs.
- Fold authority into revision digest — breaks mid-op baselines and in-flight
  expected_revision bindings.
- Encode consume only as journal rows — couples effect journal to authority.

## Consequences

Restart fixtures restore authority from snapshot. Exact replay reads the bag
instead of re-consuming. Apply must migrate kernel consume into the CAS call.
Reversible by dropping the bag and restoring post-CAS Map consume.
