# ADR-003: Fingerprint compatibility via snapshot self-consistency (no version bump)

- Status: proposed
- Change: fix-fu1-review-gate-attribution-gap
- Date: 2026-09-17

## Context
The synthetic fact changes `sources.facts` for kernel-scope evidence, so freshly computed fingerprints differ from pre-change ones. The proposal lists "cambio de fingerprint rompe compatibilidad con gates ya persistidos" as a risk and proposes replay tests.

## Decision
Do not version `fingerprintEvidence`. Persisted gates/lineages store their own `evidence.sources` snapshot and `validateQualityEvidence` recomputes the fingerprint from that snapshot, so pre-change persisted states remain valid without migration. Only re-normalized evidence gets the new fact. Replay tests with pre-change persisted fixtures are the guard.

## Alternatives
- `fingerprint_v2` dual field — dual-read complexity for zero behavioral gain.
- Evidence schema bump to 3 — would force migration of live v2 gates and lineages.

## Consequences
No migration; rollback is a plain revert. Cost: any tooling that re-normalizes historical diffs and compares fingerprints will see drift — covered by replay tests asserting snapshot self-consistency rather than cross-version equality.
