# ADR-001: Monotonic Inline Mutation Budget Consumption

- Status: proposed
- Change: k6c-budget-execution-failclosed
- Date: 2026-08-31

## Context
During `focal-mutation` execution in `runner.js`, mutation budget limits were not monotonically tracked or enforced per individual mutation. When a challenge exceeded its mutation quota, it could continue evaluating mutations without budget or fail to emit a canonical typed causal failure descriptor.

## Decision
Pass `tracker` (`createChallengeBudgetTracker`) and `plan` into `runIsolatedMutation`. Before evaluating each individual candidate mutation inside the loop, invoke `tracker.consumeMutations(1)`. If consumption returns `false`, halt execution immediately and return `{ ok: false, causalFailure: tracker.buildExhaustionFailure({ candidateId: plan.candidate_id, planId: plan.plan_id, dimension: "mutation_budget" }) }`.

## Alternatives
- Pre-deduct total expected mutations upfront: rejected because actual mutation count varies dynamically with AST/line filters and does not reflect progressive step-by-step execution.
- Post-execution budget accounting: rejected because unbudgeted mutations would already have executed in the sandbox.
- Emit `outcome: "failed"` instead of causal failure: rejected because budget exhaustion is a validation gap infrastructure bound, not a test suite complacency failure.

## Consequences
- Guaranteed fail-closed halt immediately upon budget exhaustion.
- Produces canonical `causal-failure/v1` with code `CHALLENGE_BUDGET_EXHAUSTED` and dimension `mutation_budget`.
- Reversibility: high (localized runner and tracker interaction).
