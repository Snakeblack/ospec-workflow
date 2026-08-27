# ADR-002: MUST walk after strategy; assessment identity ≠ EvidenceId

- Status: proposed
- Change: k6b-verification-integrity-remediation
- Date: 2026-08-27

## Context

`evaluateStrategy()` only checks role minimums. PASS was therefore possible without Obligation Manifest coverage. `obligation_ids` on classified evidence are ephemeral, so `satisfies` edges cannot be replayed from `evidence/v2`.

## Decision

Keep `evaluateStrategy` as the role-shape gate. After it succeeds, walk every non-deferred `must` obligation, emit `assessment/v1` records, and require those assessments for PASS. `computeEvidenceId` stays observation-only. `assessment_id` fingerprints `evidence_id`, `role`, `obligation_id`, `node_id`, `candidate_id`, and `policy_snapshot_id`.

## Alternatives

- Fold MUST coverage into `evaluateStrategy`: rejected; mixes strategy policy with graph obligations and reason codes.
- Walk obligations before strategy: rejected; delays cheap role failures.
- Treat unique-sort of `verification.evidence_ids` as binding identity: rejected; one EvidenceId used as four roles would collapse.

## Consequences

Reason codes split cleanly (`MISSING_STRATEGY_MINIMUM` vs `UNFULFILLED_MUST` / `UNKNOWN_OBLIGATION_ID` / `WRONG_IMPLEMENTING_NODE`). Projector `satisfies` edges consume assessments only. Existing tests that omit obligation bindings will fail closed until updated.
