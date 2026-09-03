# ADR-003: Dual-Schema Lineage and Explicit Taxonomy Migration

- Status: proposed
- Change: quality-review-gate
- Date: 2026-09-03

## Context

`review-lineage.js` freezes `schema_version: 1`, digest domain `review-lineage-v1`, and finding owners in `{risk,reliability,resilience,readability}`. Deleting 4R agents/skills would strand a started v1 lineage (e.g. risk completed, reliability pending) that MUST NOT migrate. A v2 identity that merely appears after v1 would lose the predecessor bind.

## Decision

Keep v1 lineages executable through terminal under 4R IDs, `gates.4r-review-gate`, and `LEGACY_V1_REVIEWERS` (`review-risk|reliability|resilience|readability`). Keep those agent and skill files. They are not v2 dispatch targets, classifier candidates, or `review-change` selections. New lineages use `schema_version: 2`, digest `review-lineage-v2`, `selected_domains`, `ACTIVE_V2_REVIEWERS`, and `gates.quality-review-gate`. `review-correction` is dual-schema: v1 4R owners, v2 quality owners, never both in one lineage.

`migrateLineageTaxonomyV2` requires a pristine lineage: selected lenses `pending`, non-selected `skipped`, no lens `request_id` or result, empty findings, `findings_digest` null, no pending operation/correction, no correction history. Map `risk→trust`, `reliability∪resilience→runtime`, `readability→evolution`. The v2 lineage MUST include a `migration` receipt (`kind: taxonomy-v1-to-v2`, `predecessor_lineage_id`, `predecessor_revision`, `predecessor_digest`) that participates in `review-lineage-v2`. Mixed ID sets fail closed.

## Alternatives

- Delete 4R executors — strands started v1 reviews.
- Always migrate in-flight state — would merge or drop completed lens results.
- Create an unbound v2 lineage after remap — loses predecessor identity.

## Consequences

Tests must cover v1 continue, each failed migrate precondition, and receipt-in-digest. Downstream verify/delivery/archive stay read-only identity checks. Completed 4R archives remain immutable. Legacy reviewers may be removed only in a future breaking change when v1 is no longer executable.
