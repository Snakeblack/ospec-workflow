# ADR-003: Evaluation Requires The Selected Strategy Binding

- Status: proposed
- Change: k6c-failclosed-integrity
- Date: 2026-08-31

## Context

The shared integrity gate compares `bindings.evidenceStrategy` to `plan.evidence_strategy` only when the binding is truthy. `verifyCandidate` computes `selectStrategy(...)` and never passes it, so a canonical plan for another strategy is accepted. Projector and replay have the same hole. Binding with `plan.evidence_strategy` would be a self-comparison.

## Decision

`validateChallengeResultSet` always requires a non-empty string `bindings.evidenceStrategy` equal to `plan.evidence_strategy`. `validateChallengePlan` requires it when any evaluation binding is present. Callers pass the already-selected strategy (`verifyCandidate().strategy`, never the plan’s own field). Integrity failures stay `CHALLENGE_INTEGRITY_INVALID`; projector/replay still map them to `GRAPH_DIVERGENCE`. Identity-only `validateChallengePlan(plan)` without bindings remains schema/identity validation.

## Alternatives

- Keep the truthy skip: rejected; it is the defect.
- Require the field on every `validateChallengePlan` call: rejected; identity tests validate plans without a selected-strategy context.

## Consequences

Optional K6c material is still gated when a plan or results are present. Replay bundles must include `evidenceStrategy` from the verifier-selected value. `strategy-policy.js` is unchanged.
