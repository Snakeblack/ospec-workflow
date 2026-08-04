# ADR-002: Canonical Domain-Prefixed CapabilityProof Digests

- Status: proposed
- Change: k2a-headless-conformance-host
- Date: 2026-08-04

## Context
An enforced capability needs reproducible evidence bound to capability, adapter, host, and fixture without reusing receipt authority.

## Decision
Compute `evidence_digest` with the existing domain-prefixed SHA-256 canonical JSON utility over capability id, adapter version, host version, fixture, and timestamp-free semantic evidence.

## Alternatives
- Hash raw JSON: rejected because key order and whitespace make it unstable.
- Reuse receipt/OperationReceipt: rejected because proofs are evidence, not operation records or semantic authority.

## Consequences
Equivalent inputs converge and cross-capability replay fails. Evidence producers must provide a stable semantic payload and remove volatile timestamps before verification.
