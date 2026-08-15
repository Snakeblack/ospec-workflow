# ADR-004: Clarify Invalidation Propagation and Fail-Closed Stale Fixture Rejection in Replay

- Status: proposed
- Change: k4a-remediation-v2-45-1
- Date: 2026-08-15

## Context
When a clarification occurred, invalidated nodes could be resurrected or marked completed by stale pre-clarification fixtures during replay. Additionally, replay accepted non-explicit completion statuses like `cancelled`.

## Decision
`applyClarifyEvent` mutates affected nodes, recomputes `graph_id`, and outputs `invalidatedNodeIds`. `replayExecutionGraph` accepts `invalidatedNodeIds` and fails closed if fixtures for invalidated nodes are supplied. Replay enforces closed completion discrimination: only explicit successful outcomes are accepted.

## Alternatives
- Silent fixture dropping during replay: rejected because masking invalid fixtures hides configuration and test setup defects.
- Permissive status acceptance: rejected because cancelled or incomplete worker tasks must not pass verification.

## Consequences
- Easier: Prevents phantom state resurrection and guarantees reproducible counterexample traces upon execution failure.
- Harder: Replay fixtures must be updated or scoped precisely to valid, non-invalidated nodes following clarification events.
- Reversibility: Easily reversible within replay engine logic.
