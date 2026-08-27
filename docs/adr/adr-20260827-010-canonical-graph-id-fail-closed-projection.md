# ADR-004: Canonical graph_id fingerprint and fail-closed projection

- Status: proposed
- Change: k6b-verification-integrity-remediation
- Date: 2026-08-27

## Context

`graph_id` currently hashes only `candidate_id` plus canonical nodes/edges. Contract or policy changes do not diverge. `verifyCandidate` returns `ok: true` when projection fails, omitting the graph. `rejectForbidden` substring-matches `id`, so `REQ-add-authorization-header` is rejected.

## Decision

Fingerprint `contract_digest`, `policy_snapshot_id`, Execution Graph digest, canonical OpenSpec input, `candidate_id`, and canonical nodes/edges in `graph_id`. Persist those digests as optional `canonical_inputs` on `assurance-graph/v1`. `verifyCandidate` requires a successful projection before `ok: true`. Match forbidden subjects by `kind`/`namespace`, never by `id` substring.

## Alternatives

- Keep the current `graph_id` preimage: rejected; replay cannot detect contract/policy drift.
- Leave projection optional on the facade: rejected; PASS without a graph is the integrity hole.
- Continue substring markers on `id`: rejected; legitimate requirement ids containing `authorization` fail.

## Consequences

Existing runtime `graph_id` values change. Replay becomes possible from persistable outputs. Facade tests that ignored projector failure must assert `GRAPH_PROJECTION_FAILED` / `GRAPH_DIVERGENCE`.
