### Quality Review Gate Dispatch

The post-verify gate runs only when the active `bugfix`, `refactor`, or `standard` route lists `quality-review-gate` and `sdd-verify` returned `status: success`. A route without the gate dispatches neither the residual router nor quality specialists.

`scripts/lib/review-lineage.js` is the executable authority for review identity, budgets, attempts, and legal transitions. `scripts/lib/review-gate-state.js` adapts only its authorized `next_action`. The orchestrator MUST persist the returned state and MUST NOT reinterpret dispatch or archive decisions. Both reducers are pure; the orchestrator remains the only I/O and agent-dispatch adapter.

Legacy in-flight lineages under `schema_version: 1` and `gates.4r-review-gate` continue via `LEGACY_V1_REVIEWERS` until terminal state or explicit pristine `migrateLineageTaxonomyV2`. New writes use `gates.quality-review-gate` with `schema_version: 2` only.

#### Deterministic-first contract pipeline

1. Collect classification, verified artifact references, affected paths, capabilities, optional explicit `capability_scopes`, operation types, dependencies, design risks, verify findings, and the real unified diff. Call `normalizeQualityReviewEvidence` from `scripts/lib/review-dimensions.js`. Attribution uses validated `capability_scopes` only — no path/id inference. Raw diff hunks MUST NOT persist.
2. Call `classifyQualityReview(normalizedEvidence)` with **no model**. High-risk selects all four quality domains and skips the router. `classification_status: sufficient` with `selected_domains: []` completes with zero model calls. `classification_status: ambiguous` is the only path that invokes `review-change`.
3. When ambiguous, dispatch `review-change` with **residual evidence per unattributed capability** only (`id`, bounded `paths`, `total_paths`, `truncated`, `fact_codes`). Validate with `validateRouterDecision`. Require `artifacts: []`.
4. Pass classifier, router, or validation errors to `planReviewGate`. Malformed router output → `blocker_reason: contract-remediation`. Valid router with `classification_status: ambiguous` → `blocker_reason: quality-review-ambiguity-unresolved` (no lineage freeze, no specialist dispatch). Valid router with `classification_status: sufficient` → merge deterministic ∪ `added_domains` and dispatch `ACTIVE_V2_REVIEWERS`.
5. On success, freeze candidate identity with `startQualityReviewLineage` (v2) or `startReviewLineage` (v1 continuation). Persist lineage by read-merge-write before specialist dispatch.

#### Selective dispatch and outcome

Call `planLineageGate` and dispatch only its `next_action`. Map v2 pending domains to `review-trust`, `review-runtime`, `review-evolution`, or `review-efficiency`. v1 continuation maps 4R dimensions to legacy reviewers. Each selected lens executes exactly once (`parallel-preferred/serial-fallback`).

Keep specialist contracts and `BLOCKER|CRITICAL|WARNING|SUGGESTION` taxonomy unchanged. Surface BLOCKER/CRITICAL through the target question gate; record WARNING/SUGGESTION without interruption.

When remediation is approved, corrections reference only the reducer-selected active slice. Persist pending correction before dispatch. After the fix, dispatch only `review-correction` with the active slice context. Dual-schema owner validation: v2 owners ∈ `{trust,runtime,evolution,efficiency}`; v1 owners ∈ `{risk,reliability,resilience,readability}`; never both in one lineage.

Zero selected specialists completes with `findings_summary: "0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION"`.

Before mutable continuation of schema-v1 lineage, reconcile pending/unknown work and run additive idempotent remediation-v2 migration. Persist the pending correction before dispatch. Unknown outcomes require exact reconciliation (`reconciliation-required`). A new review requires an explicit successor; no implicit reset.

Never relaunch `review-change` or any specialist after findings freeze. Verify, delivery, and archive are read-only identity checks.
