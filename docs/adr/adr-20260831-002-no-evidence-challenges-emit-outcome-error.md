# ADR-002: No-Evidence Challenges Emit Outcome Error

- Status: proposed
- Change: k6c-failclosed-integrity
- Date: 2026-08-31

## Context

`runWorkspaceTests` reports `failure_class: "missing_tests"`. The revert path excludes that class from `CHALLENGE_EXECUTION_ERROR` and then treats a non-zero exit as defect detection (`passed`). Zero mutations and no-op byte applies also emit `passed`. Spec forbids `passed` and forbids treating `missing_tests` as COMPLACENT.

## Decision

Emit schema-valid results with `outcome: "error"` and `details.reason` of `MISSING_TESTS`, `NO_MUTATION_APPLIED`, or `CHALLENGE_NOOP`. Keep `failed`/`COMPLACENT_TEST_DETECTED` only when tests pass against a mutation or revert that actually changed isolated candidate-copy bytes.

## Alternatives

- `failed` + COMPLACENT for missing tests: rejected; it inverts meaning (no suite existed to miss a defect).
- Collapse all three into `CHALLENGE_EXECUTION_ERROR`: rejected; that code already means sandbox/cancel/throw.

## Consequences

Verifier already fail-closes any non-`passed` outcome (`CHALLENGE_VERIFICATION_FAILED`). `details` stays an open object; no schema bump. Operators can distinguish “no tests” from “no mutation” from “apply was a no-op”.
