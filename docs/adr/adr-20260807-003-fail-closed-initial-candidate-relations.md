# ADR-003: Fail-Closed Initial Candidate Relation Evaluation

- Status: proposed
- Change: k3-identities-candidate-freeze
- Date: 2026-08-07

## Context
When comparing candidate trees or resolving candidate target selectors, ambiguous path matches, base tree shifts, or missing candidate records can lead to unsound verification reuse if optimistically assumed to be compatible.

## Decision
The initial Candidate relation evaluator classifies relations into four strict values: `exact`, `changed`, `ambiguous`, or `unknown`. `exact` allows validation reuse; `changed` triggers re-evaluation; `ambiguous` and `unknown` fail closed with `stop` or `decide` transitions. Advanced relations like `compatible-base-advance` remain experimental.

## Alternatives
- Automatic optimistic base-advance reuse: Rejected due to risk of silent regression when base trees advance.
- Complex multi-valued relational algebra at initial stage: Rejected to keep early kernel evaluation simple, deterministic, and safe.

## Consequences
- Guarantees fail-closed safety on any selector ambiguity or non-deterministic state.
- Halts execution safely until human or policy decisions resolve ambiguous candidates.
