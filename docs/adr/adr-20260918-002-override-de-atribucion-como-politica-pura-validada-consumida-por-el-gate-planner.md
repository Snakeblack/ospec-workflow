# ADR-002: Attribution override as pure validated policy consumed by the gate planner

- Status: proposed
- Change: fix-fu1-review-gate-attribution-gap
- Date: 2026-09-17

## Context
REQ-002 requires an optional, versioned `quality_review.attribution_override` block in `openspec/config.yaml` (mirroring `quality_gates`) that closes ambiguity codes auditable and fails closed when malformed. Kernel libs are pure; config IO lives in the adapter layer.

## Decision
`validateAttributionOverride(block)` lives in `scripts/lib/review-dimensions.js` (strict shape: non-empty `justification`, non-empty `scope`, `applies_to` ⊆ `AMBIGUITY_CODES`). `scripts/route-dispatch-run.js` loads the optional block and passes it to `planQualityReviewGate`, which applies it only to matching codes/paths, records `{ source, justification, scope, closed_codes }` in the gate audit, and removes closed codes from `ambiguity_reasons` in the same evaluation.

## Alternatives
- Apply the override inside the classifier — contaminates deterministic evidence with policy.
- Handle it in the orchestrator skill — unauditable by the reducers and untestable as contract.

## Consequences
Absence is a strict no-op; malformation blocks with a structured error (never a silent bypass). Override never suppresses findings or unselects fact-derived domains. Reversible: delete the config block.
