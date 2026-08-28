# ADR-002: Additive `runner_receipts_digest` in `computeRevision`

- Status: proposed
- Change: k6b-durable-replay-receipt-authority
- Date: 2026-08-28

## Context
Revision identity currently fingerprints state, journal, and `digestAuthority({permits, receipts})`. Hashing a new bag unconditionally would retag every existing head and violate REQ-013.

## Decision
Extend `computeRevision(state, journal, authority, runnerReceipts)` with optional `runner_receipts_digest` included only when the map has keys. Empty or absent `runner_receipts` MUST produce the same digest as today's three-component revision. `digestAuthority` MUST NOT gain a third family.

## Alternatives
- Always hash `runner_receipts: {}` inside the revision payload — rejected: every pre-change head would diverge on reload.
- Fold the bag into `digestAuthority` — rejected: changes OperationReceipt root identity and mixes families.
- Omit the bag from revision entirely — rejected: two CAS writers could swap receipts without a new head.

## Consequences
- Easier: existing FileSystemStore heads keep their revision; lifecycle CAS stays compatible until the first runner-receipt persist.
- Harder: FileSystemStore expectedRevision checks MUST pass the live bag or post-persist lifecycle commits cas-conflict.
- Reversibility: Medium; once non-empty bags are committed, removing the fourth component would fork heads.
