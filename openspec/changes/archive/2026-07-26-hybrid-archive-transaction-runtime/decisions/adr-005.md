# ADR-005: Gate, approval and baseline-fingerprint preflight is runtime-owned

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

Today `sdd-archive` re-hashes baselines itself and returns `blocker_type: stale-baseline`.
Architecture §9.1 assigns fingerprints and gate validation to the deterministic plane, and
the skills delta forbids blind merges by the agent.

## Decision

The runtime re-reads `state.yaml` during preflight — verify verdict, `gates.quality-gates`
status plus any override approval, and `baseline_fingerprints` — using `readState()` from
`ospec-state.js` plus a pure `readArchiveGateFacts(text)` line-oriented reader, and compares
each `spec_writes[].target_before_sha256` against live target bytes. No YAML dependency is
added.

## Alternatives

- Trust the gate summary embedded in the plan — self-certification by the agent.
- Add a YAML parser dependency — breaks the repository's zero-dependency constraint.

## Consequences

Stale baselines and unsatisfied gates now fail closed inside the transaction, before any
mutation. The runtime carries a small hand-rolled reader that must track the `state.yaml`
shape, consistent with the existing parsers in `ospec-state.js`.
