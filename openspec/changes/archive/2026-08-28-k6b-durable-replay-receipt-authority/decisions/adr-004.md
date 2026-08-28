# ADR-004: Replay role bind independent of recomputed `assessment_id`

- Status: proposed
- Change: k6b-durable-replay-receipt-authority
- Date: 2026-08-28

## Context
`computeAssessmentId` already includes `normalizeRole(role)`, so mutating `assessment.role` from `acceptance` to `integration` and recomputing `assessment_id` still passes identity validation. Replay did not compare that role to the bound `runner-receipt/v1`.

## Decision
In `validateReplayRecords`, require `normalizeRole(assessment.role) === normalizeRole(boundReceipt.role)` using `scripts/lib/independent-verifier/assessment.js`. Mismatch MUST fail closed with `GRAPH_DIVERGENCE` even when `assessment_id` matches. The check is independent of token coverage and of Evidence-id binding.

## Alternatives
- Treat matching `assessment_id` as sufficient — rejected: that is the v2.54.0 hole.
- Bind role only when `evidence_requirements_satisfied` is non-empty — rejected: role must agree whenever a receipt is bound.
- Compare raw strings without `normalizeRole` — rejected: aliases (`consume` → `acceptance`) would false-diverge.

## Consequences
- Easier: adversarial tamper fixtures are a single comparison next to existing token attestation.
- Harder: assessments and receipts must use roles that canonicalize to the same value.
- Reversibility: High (localized to the replay assessment loop); removing it reopens the tamper.
