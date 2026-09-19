# ADR-004: `createSuccessor` branches by predecessor schema version

- Status: proposed
- Change: fix-fu1-review-gate-attribution-gap
- Date: 2026-09-17

## Context
`createSuccessor` (`scripts/lib/review-lineage.js` L607-643) always calls `startReviewLineage`, producing v1 lineages even from terminal v2 predecessors, forcing manual v2 lineage construction (CX1 debt). REQ-routing-012 requires native v2→v2 succession with fail-closed taxonomy mixing.

## Decision
Branch on `predecessor.schema_version === 2` → call `startQualityReviewLineage` with the predecessor's genesis domains plus successor meta (generation+1, `predecessor_lineage_id`, recovery). A request carrying `selected_dimensions` against a v2 predecessor, or requesting a v1 successor, throws a structured taxonomy `TypeError` before any state is created. Approval-reference and authority-kind checks are reused unchanged.

## Alternatives
- Migrate-then-successor two-step — reintroduces the manual construction this change removes.
- Always emit v2 — would silently change taxonomy for v1 lineages mid-flight.

## Consequences
Succession is taxonomy-preserving and native; predecessor records stay immutable. Budget/approval semantics unchanged. Reversible by reverting the branch.
