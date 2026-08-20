# ADR-003: Closed Allowlisted Transition Matrix, Bounded Repair Scopes, and Zero-Delta Honesty Guarantees

- Status: proposed
- Change: k5-budgets-failures-recovery
- Date: 2026-08-17

## Context

Unbounded recovery loops and unconstrained repair mutations can cause oscillating state, silent regressions, and infinite execution loops. The system requires verifiable progress guarantees and strict blast-radius containment during failure recovery.

## Decision

Implement an allowlisted recovery transition matrix mapping failure categories to `{repair, replan, escalate, stop}`, enforce bounded repair scopes (`node_ids`, `allowed_paths`, `finding_ids`), count zero-delta mutations against attempt quotas, and require blocking fingerprint advancement (`blockingFingerprint(after) != blockingFingerprint(before)`) or force terminal `stop`.

## Alternatives

- Unrestricted recovery allowing arbitrary repair actions: rejected because workers can mutate unrelated subsystems or enter unconstrained loops.
- Attempt-only retry caps without fingerprint checking: rejected because repetitive executions with identical failure output can waste quotas without advancing diagnostic state.

## Consequences

- Easier: Strong progress guarantees, bounded blast radius for repair workers, and deterministic termination of stagnant recovery cycles.
- Harder: Repair workers must strictly adhere to declared ownership paths and frozen finding IDs.
- Reversibility: High — transition rules are enforced via pure selectors and schemas.
