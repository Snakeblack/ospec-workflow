# ADR-001: Pure Decoupled Budget Evaluator and Monotonic State Accounting with Telemetry Isolation

- Status: proposed
- Change: k5-budgets-failures-recovery
- Date: 2026-08-17

## Context

Graph nodes and authoritative operations require strict quota enforcement (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`, `effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). Mutable counters embedded directly in state digests cause CAS churn and non-deterministic hashing.

## Decision

Implement a pure functional budget evaluator in `scripts/lib/execution-budgets.js` that evaluates immutable budget envelopes and decrements quotas monotonically across retries and CAS reconciliations, while isolating volatile telemetry counters from canonical state digests via `stripVolatile`.

## Alternatives

- Embed counters directly in semantic lifecycle state digests: rejected because volatile timings destroy state digest determinism and replayability.
- Externalize budget accounting into an asynchronous stateful daemon: rejected because it introduces unnecessary network failure modes into pure kernel operations.

## Consequences

- Easier: Deterministic state hashing, replayable execution traces, and strict monotonicity across retries and CAS conflicts.
- Harder: Reducers must explicitly pass and strip telemetry when deriving next states.
- Reversibility: High — pure library functions with clean schema boundaries.
