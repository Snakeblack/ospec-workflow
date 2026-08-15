# ADR-002: Deterministic GraphId Coupled to Contract, Policy Bundle, and SourceSnapshot Digests

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
Execution graphs must be reproducible across environments, bound to an exact source tree snapshot, and resilient to stealth policy, contract, or code changes without relying on volatile random identifiers.

## Decision
Derive `GraphId` as a deterministic SHA-256 fingerprint computed from canonical `contract_digest`, `policy_bundle_digest`, `source_snapshot_id`, and the compiled semantic node array. ExecutionGraph v1 schema requires `source_snapshot_id` matching `^sha256:[a-f0-9]{64}$`.

## Alternatives
- Random UUIDv4 or sequential IDs: rejected because they prevent idempotent compilation caching and cannot detect policy or provenance drift.
- Contract and policy hash without source snapshot: rejected because graphs compiled against different code snapshots would collide on identity and risk stale replay.

## Consequences
- Easier: Reproducible compilation, deterministic replay matching, and instant detection of code provenance or policy drift.
- Harder: Any change to source snapshot, policy rules, or contract alters the GraphId, requiring explicit recompile.
- Reversibility: Highly reversible prior to dependent runtime persistence in later slices.
