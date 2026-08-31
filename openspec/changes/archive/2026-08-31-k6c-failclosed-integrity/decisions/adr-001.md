# ADR-001: Planner Rejects Invalid Strategy With TypeError

- Status: proposed
- Change: k6c-failclosed-integrity
- Date: 2026-08-31

## Context

`createChallengePlan` coerces omitted, empty, or unknown `evidenceStrategy` to `strict-tdd` and still emits a plan. REQ-adversarial-challenges-002 now forbids that coercion. The planner is a synchronous constructor that already throws `TypeError` for missing `candidateId`, `nodeId`, and `policySnapshotId`.

## Decision

Throw `TypeError` for omitted, empty/non-string, and unknown non-empty `evidenceStrategy`. Do not return a plan. Distinguish missing vs unknown only in the message. Do not introduce a `{ ok, reason_code }` envelope.

## Alternatives

- Result envelope with `CHALLENGE_STRATEGY_UNKNOWN`: rejected because it changes the constructor contract for every caller.
- TypeError for empty, reason_code for unknown: rejected because two observables split catch paths for one invariant.

## Consequences

Callers that already catch `TypeError` fail closed uniformly. Verifier REQ-002 fallback remains in `selectStrategy`, not here. Reverting restores silent coercion.
