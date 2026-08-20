# ADR-002: Structured 5-Category Causal Failure Taxonomy with Precedence

- Status: proposed
- Change: k5-budgets-failures-recovery
- Date: 2026-08-17

## Context

Execution and verification failures were previously unstructured or mixed, leading to host timeouts, container crashes, or CAS race conflicts being misattributed as code defects and incorrectly triggering code repair loops.

## Decision

Establish a structured 5-category causal failure taxonomy (`environment_tooling`, `cas_conflict`, `ambiguous_effect`, `validation_gap`, `code_defect`) in `scripts/lib/causal-failure.js` with deterministic priority precedence (`environment_tooling (P1) > cas_conflict (P2) > ambiguous_effect (P3) > validation_gap (P4) > code_defect (P5)`), ensuring infrastructure and concurrency issues take precedence over code assertions.

## Alternatives

- Free-form string error codes with heuristic recovery: rejected due to unpredictable retry loops and code blame for tooling crashes.
- Binary classification (Transient vs Permanent): rejected because it lacks necessary granularity for CAS re-synchronization vs validation gaps.

## Consequences

- Easier: Clear attribution of faults, deterministic resolution of multi-failure batches, and accurate recovery routing.
- Harder: All verification and execution errors must map into the closed 5-category taxonomy.
- Reversibility: High — taxonomy codes and legacy tag mappings are encapsulated in a pure module.
