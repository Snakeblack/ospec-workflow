# ADR-002: Classification fingerprint via stableSerialize + SHA-256

- Status: proposed
- Change: k1-contract-suite
- Date: 2026-08-03

## Context

Identical normalized classification inputs must yield a stable fingerprint across
platforms. Specs require determinism but left the algorithm to design. The repo
already fingerprints review evidence and lineage with sorted-key serialization
and SHA-256 prefixed `sha256:`.

## Decision

Canonicalize with recursive key-sorted `stableSerialize`, then hash as
`sha256:` + hex digest. Classification fingerprints use domain prefix
`change-classification\0` before the canonical bytes (same pattern as
`review-lineage.digest`). Shared helpers live in `scripts/lib/canonical-json.js`.

## Alternatives

- Hash without domain prefix — collisions across fingerprint spaces.
- RFC 8785 JCS via new dependency — breaks zero-deps policy.
- Pretty-printed JSON hash — non-deterministic key order.

## Consequences

Fingerprints stay interoperable with existing `sha256:<hex>` consumers and are
cheap to unit-test. Changing canonicalization later is a breaking schema event
requiring a version bump. Reversible only with a new schema_version + migration.
