# ADR-003: Deterministic Non-Authoritative K6c Graph Projection

- Status: proposed
- Change: k6c-integrity-remediation
- Date: 2026-08-28

## Context
K6c must affect Assurance Graph identity and replay without becoming `evidence/v2`, an attestation, or delivery/lifecycle authority.

## Decision
Add `challenge-plan` and `challenge-result` node kinds. Project the canonical plan ID from Candidate and each exact result ID from the plan; bind successful verification to accepted results. Persist full records outside graph nodes and revalidate them before replay/reconcile.

## Alternatives
- Omit K6c from `graph_id`: rejected because replay could silently lose or replace results.
- Store full mutable records in nodes: rejected because graph nodes intentionally contain only identity and kind.
- Alias results as `test-evidence`: rejected because challenge results have a distinct contract and authority boundary.

## Consequences
Byte-identical records yield identical nodes, edges, and `graph_id`; any cardinality/binding drift fails `GRAPH_DIVERGENCE`. Assurance Graph v1's node-kind enum and claims change atomically, but no authorization relation or kind is introduced.
