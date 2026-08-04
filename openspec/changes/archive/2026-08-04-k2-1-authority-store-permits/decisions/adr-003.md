# ADR-003: Runtime-owned OperationPermit ledger

- Status: proposed
- Change: k2-1-authority-store-permits
- Date: 2026-08-04

## Context

K2 treated any non-empty `AuthorityToken` as sufficient for mutating operations.
Models could embed tokens. Specs require runtime-only minting, single-use,
revision-bound permits, and rejection of self-grant.

## Decision

Only kernel `mintOperationPermit` may insert into a permit ledger keyed by
`permit_id`. Authorize requires ledger membership, schema fields,
`single_use`, and `expected_revision === head`. Consume marks the permit used
and emits OperationReceipt. Offer-only and token-only paths fail closed.

## Alternatives

- Cryptographic signatures without trust root — out of scope; deferred.
- Trust caller-supplied permit blobs by shape alone — enables model self-grant.

## Consequences

Token≠permit gap closes. Harness/model fixtures can prove rejection of
fabricated permits. Ledger is process-local for K2.1 memory store; durable
multi-process ledger remains a later concern if hosts share subjects.
