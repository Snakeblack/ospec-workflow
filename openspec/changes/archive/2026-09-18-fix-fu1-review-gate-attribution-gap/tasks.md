# Tasks: Fix FU1 — quality-review gate attribution gap for clean kernel-contract changes

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Spec/Design Reconciliation

REQ id legend: `QRAR-00N` = `REQ-quality-review-attribution-resolution-00N`; `ROUTING-NNN` = `REQ-routing-NNN`; `INSTALL-026` = `REQ-install-026`.

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| QRAR-001 synthetic fact `kernel-contract-change` (trust,evolution) via scope attribution | MUST | `scripts/lib/review-dimensions.js` — `V2_SIGNALS`/`V2_FACT_SOURCES`, emission in `normalizeQualityReviewEvidence`, `attributeFactsFromScopes`/`buildCapabilityCoverage` | covered-by-design | ADR-001; flows through fingerprint + audit |
| QRAR-001 no masking of other ambiguity codes | MUST | `review-dimensions.js` L643 — rule `runtime-code-without-domain-attribution` becomes per-capability | covered-by-design | Required companion change (design key decision #4) |
| QRAR-002 override declarativo validado fail-closed | MUST | `validateAttributionOverride` in `review-dimensions.js`; consumed by `planQualityReviewGate` (`review-gate-state.js`); loaded in `scripts/route-dispatch-run.js` | covered-by-design | ADR-002; 3 malformations tested |
| QRAR-003 router contract accepts structured `resolution` | MUST | `validateRouterDecision`/`mergeRouterDecision` optional exact-shape `resolution` key | covered-by-design | Residual without `fact_codes` never closes alone |
| QRAR-004 / ROUTING-012 `createSuccessor` v2 native, taxonomy fail-closed | MUST | `scripts/lib/review-lineage.js` — branch on `predecessor.schema_version === 2` → `startQualityReviewLineage`; mixed taxonomy `TypeError` | covered-by-design | ADR-004 |
| ROUTING-003 audit records resolution once as closed | MUST | `review-gate-state.js` — audit `resolution` record; closed code removed from `ambiguity_reasons` | covered-by-design | MODIFIED requirement |
| ROUTING-008 kernel scopes attribute via synthetic fact; per-capability coverage | MUST | Same lib changes as QRAR-001; per-capability coverage evaluation | covered-by-design | MODIFIED requirement; blast-radius scenarios already pinned by existing tests |
| Fingerprint compatibility (ADR-003, risk) | SHOULD | No version bump; replay fixtures of pre-change persisted gate/lineage snapshots | covered-by-design | Snapshot self-consistency, not cross-version equality |
| INSTALL-026 propagation to claude/vscode/github-copilot/opencode | MUST | Regenerate dist via `scripts/configure/cli.js` BFS; extend `validate-{claude,vscode,github-copilot,opencode}.js` sentinels | covered-by-design | Dist tests self-generate in temp dir (never root `dist/`) |
| INSTALL-026 out-of-scope targets byte-equivalent | SHOULD | Assumption sdd-design-001: equivalence applies to target-differentiated projections, not shared `scripts/lib/**` bytes | ambiguous | Interpretation carried into task 5.3; flag again in verify |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none blocking (INSTALL-026 byte-equivalence interpreted per sdd-design-001)
- Ambiguities to track: override `scope` matching semantics (glob vs prefix) — resolved as prefix/glob consistent with `SELF_REVIEW_PREFIXES` style; internal detail, recorded as assumption.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600–780 (src ~260, tests ~300–400, docs/config ~80) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 lib+gate (Phases 1–2) → PR 2 lineage (Phase 3) → PR 3 config/docs/build (Phases 4–5) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Exceeds the 400-line budget: under `single-pr` strategy this requires explicit `size:exception` approval, or switching to the chained split above (each unit is independently verifiable via `npm test`). Decision is required before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Synthetic fact + per-capability rule + override + router resolution + gate planning (Phases 1–2) | PR 1 | Kernel libs + gate planner; fully unit-testable, ~400 lines |
| 2 | `createSuccessor` v2 native + taxonomy fail-closed (Phase 3) | PR 2 | Independent of unit 1 at code level; `review-lineage.test.js` |
| 3 | Config block, skill docs, roadmap, dist regeneration + validators (Phases 4–5) | PR 3 | Depends on units 1–2 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Kernel lib — synthetic fact and per-capability attribution (TDD RED→GREEN)

- [x] 1.1 RED: in `scripts/lib/review-dimensions.test.js`, add test — evidence with `capability_scopes: ["schemas/kernel/result-envelope/**"]`, zero lexical signals, classification `normal` → expect synthetic fact `kernel-contract-change` (domains `trust`,`evolution`, source `metadata`, `attributed_capabilities: [<scopeId>]`), valid fingerprint, `classification_status: sufficient`, no `public-kernel-contract-unattributed`. [QRAR-001, ROUTING-008]
- [x] 1.2 GREEN: add `kernel-contract-change` to `V2_SIGNALS`/`V2_FACT_SOURCES` in `scripts/lib/review-dimensions.js` and emit it in `normalizeQualityReviewEvidence` once per validated scope covering `schemas/kernel/**`, so it flows through `attributeFactsFromScopes` → `buildCapabilityCoverage` → fingerprint. [QRAR-001]
- [x] 1.3 RED+GREEN: test that the synthetic fact appears in the routing audit and creates no specialist finding by itself. [QRAR-001]
- [x] 1.4 RED+GREEN: masking test — kernel scopes + out-of-scope runtime capability with zero signal → out-of-scope capability unattributed, `classification_status: ambiguous` via `runtime-code-without-domain-attribution`. [QRAR-001, ROUTING-008]
- [x] 1.5 GREEN: replace the global guard at `review-dimensions.js` L643 with the per-capability rule (fire when any behavioral capability has runtime production paths in scope and zero `attributed_domains`); add test for a single unattributed runtime capability triggering the runtime rule and not `cross-capability-blast-radius`. [QRAR-001, ROUTING-008]
- [x] 1.6 RED+GREEN: replay test — pre-change persisted gate/lineage evidence snapshot (fixture inline in the test file) still passes `validateQualityEvidence` and plans correctly (snapshot self-consistency, not cross-version fingerprint equality). [QRAR-001 risk / ADR-003]

## Phase 2: Override policy + router resolution + gate planning (TDD RED→GREEN)

- [x] 2.1 RED: tests in `review-dimensions.test.js` for `validateAttributionOverride` — valid block passes; three malformations fail with structured errors: empty `justification`, empty/absent `scope`, unknown `applies_to` code. [QRAR-002]
- [x] 2.2 GREEN: implement `validateAttributionOverride(block)` in `scripts/lib/review-dimensions.js` (strict shape, `applies_to` ⊆ `AMBIGUITY_CODES`). [QRAR-002]
- [x] 2.3 RED: tests in `review-gate-state.test.js` — valid override whose residual is `public-kernel-contract-unattributed` in scope → code closed, audit records `{ source: "attribution-override", justification, scope, closed_codes }`, dispatch/archive proceeds; override listing only kernel code does NOT close `runtime-code-without-domain-attribution`; malformed override → gate blocked with `validation_error_codes: ["attribution-override-invalid"]`, ambiguity unresolved. [QRAR-002, ROUTING-003]
- [x] 2.4 GREEN: extend `planQualityReviewGate({ attributionOverride })` in `scripts/lib/review-gate-state.js` — apply override only to codes in `applies_to` with residual paths matching `scope` (prefix/glob per `SELF_REVIEW_PREFIXES` style), record resolution in the gate audit, remove closed codes from `ambiguity_reasons` in the same evaluation; absence of the block is a strict no-op. [QRAR-002, ROUTING-003]
- [x] 2.5 RED+GREEN: `validateRouterDecision`/`mergeRouterDecision` in `review-dimensions.js` — optional exact-shape `resolution: { source: "scope-attribution" | "attribution-override", codes, justification?, scope }` validates; decision claiming resolution without a valid source fails (`router-contract-invalid`); residual evidence without `fact_codes` and no resolution stays blocked (`quality-review-ambiguity-unresolved`); closed code never re-appears as unresolved in the same evaluation. [QRAR-003, ROUTING-003]
- [x] 2.6 GREEN: in `scripts/route-dispatch-run.js`, load optional `quality_review.attribution_override` from `openspec/config.yaml`, validate it, and pass it to `planQualityReviewGate` (adapter layer only; kernel libs stay pure). [QRAR-002]

## Phase 3: Lineage — `createSuccessor` v2 native (TDD RED→GREEN)

- [x] 3.1 RED: tests in `scripts/lib/review-lineage.test.js` — terminal v2 predecessor + approved successor → successor declares schema v2 with `trust`/`runtime`/`evolution`/`efficiency` owners, generation+1, `predecessor_lineage_id`, recovery meta; predecessor record complete and unmodified. [QRAR-004, ROUTING-012]
- [x] 3.2 GREEN: in `scripts/lib/review-lineage.js` `createSuccessor` (L607-643), branch on `predecessor.schema_version === 2` → call `startQualityReviewLineage` with the predecessor's genesis domains + successor meta; reuse approval-reference (`-bounded-review-###`) and authority-kind checks unchanged. [QRAR-004, ROUTING-012]
- [x] 3.3 RED+GREEN: mixed-taxonomy fail-closed — request with `selected_dimensions` (4R owners) against a v2 predecessor, or forced v1 output, throws structured taxonomy `TypeError` before any state/budget is created; v1 predecessor keeps producing v1 successors (no silent taxonomy flip). [QRAR-004, ROUTING-012]

## Phase 4: Config, skill docs, roadmap

- [x] 4.1 Add commented `quality_review.attribution_override` block to `openspec/config.yaml` mirroring the `quality_gates` comment pattern (L164-218): `justification`, `scope`, `applies_to`; commented out = strict no-op. [QRAR-002]
- [x] 4.2 Update `skills/_shared/gate-4r-review.md`: document kernel-contract scope attribution, the override route, and the resolution audit record. [QRAR-001, QRAR-002, ROUTING-003]
- [x] 4.3 Update `docs/roadmaps/harness-evolution.md`: mark FU1 done; register the two follow-ups (phase reducer reviewers-as-fases; archive-transaction journal failed) with their size criteria from the proposal. [proposal Success Criteria]

## Phase 5: Build propagation and full verification

- [x] 5.1 Extend `scripts/configure/validate-claude.js`, `validate-vscode.js`, `validate-github-copilot.js`, `validate-opencode.js` with sentinels covering the attribution behavior through each target's native tool mappings; unmapped kernel tool references must fail that target's validation. [INSTALL-026]
- [x] 5.2 Run `node scripts/configure/cli.js` and each target's `validate-*` (claude, vscode, github-copilot, opencode) — all pass; configure/dist tests self-generate output in a temp dir, never reading gitignored root `dist/`. [INSTALL-026]
- [x] 5.3 Verify out-of-scope targets: regenerated `codex`/`cursor`/`antigravity` projections (skills/agents/rules/native mappings) are unchanged vs prior build; shared `scripts/lib/**` bytes change in all targets by construction (per assumption sdd-design-001) — record any deviation as a verify flag. [INSTALL-026]
- [x] 5.4 Full suite `npm test` green; confirm every MUST REQ (QRAR-001..004, ROUTING-003/008/012, INSTALL-026) maps to at least one passing test for the verify traceability matrix. [all]

## Out of Scope (do not implement here)

- Reducer registering reviewers as "fases" in `state.yaml` (follow-up in roadmap).
- Journal failed of the archive-transaction blocking re-runs (follow-up with its own contract decision).
- Taxonomy redesign, v1 lineage migration, codex/cursor/antigravity attribution projections.
