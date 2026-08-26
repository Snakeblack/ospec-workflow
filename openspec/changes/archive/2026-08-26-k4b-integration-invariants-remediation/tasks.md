# Tasks: K4b Integration Invariants Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-repair-shadow-010 / header-only create rejected | MUST | `patch-integrator.js`, `index.test.js` | covered-by-design | Terminal parse validation |
| REQ-repair-shadow-010 / header-only delete rejected | MUST | `patch-integrator.js`, `index.test.js` | covered-by-design | Same parser path |
| REQ-repair-shadow-010 / non-empty patch without hunks | MUST | `parseUnifiedDiffs` structured result | covered-by-design | Fail before freeze |
| REQ-repair-shadow-010 / mode-only remains valid | MUST | Mode classification + freeze assertion | covered-by-design | Existing-path only |
| REQ-repair-shadow-011 / ancestor-descendant overlap OK | MUST | `orchestrator.js` ancestor closure | covered-by-design | Chain regression |
| REQ-repair-shadow-011 / incomparable diamond fails | MUST | `detectPredecessorContextConflicts` | covered-by-design | Pre-dispatch |
| REQ-repair-shadow-011 / later diamond no false conflict | MUST | Per-node predecessor-set filter | covered-by-design | Subset only |
| REQ-repair-shadow-012 / intersection materialization | MUST | `orchestrator.js` + `worker-workspace.js` | covered-by-design | WorkOrder handoff unchanged |
| REQ-repair-shadow-012 / missing capsule input fails | MUST | Pre-write resolver | covered-by-design | No executor dispatch |
| REQ-repair-shadow-006 / seven-dimension match | MUST | `buildComparisonProjection` + comparator | covered-by-design | All keys required |
| REQ-repair-shadow-006 / discrepancy telemetry non-halting | MUST | `shadow-comparator.js` | covered-by-design | Production untouched |
| REQ-repair-shadow-006 / strict non-mutation | MUST | Read-only comparator + orchestrator | covered-by-design | Before/after snapshot |
| REQ-repair-shadow-006 / empty values evaluated | MUST | Required-key validator | covered-by-design | Not skipped |
| REQ-repair-shadow-006 / steps = topological node_id | MUST | `topologicalSort` projection | covered-by-design | Not operation/WO id |
| REQ-repair-shadow-006 / invalid projection rejected | MUST | `INVALID_COMPARISON_PROJECTION` | covered-by-design | No silent fallback |
| REQ-repair-shadow-009 / persist bindings | MUST | `execution-record-store.js` | covered-by-design | C1+G1+P1 |
| REQ-repair-shadow-009 / audit query retrievable | MUST | `by_candidate` secondary index | covered-by-design | Plural query |
| REQ-repair-shadow-009 / incomplete bindings fail | MUST | Pre-commit validator | covered-by-design | No promotion |
| REQ-repair-shadow-009 / N records per Candidate | MUST | Fingerprint-keyed store | covered-by-design | Two-payload test |
| REQ-repair-shadow-009 / byte-identical idempotent | MUST | Existing-fingerprint branch | covered-by-design | No duplicate |
| REQ-repair-shadow-009 / fingerprint not fifth identity | MUST | Four-slot lineage assertion | covered-by-design | Storage metadata only |
| REQ-execution-graph-compiler-009 / deterministic capsule_inputs | MUST | `work-order-compiler.js` | covered-by-design | Double-compile test |
| REQ-execution-graph-compiler-009 / emitted WO validates | MUST | Schema + post-emission check | covered-by-design | v2 fixtures |
| REQ-execution-graph-compiler-009 / empty/glob fail atomic | MUST | Pre-build validation | covered-by-design | Zero WorkOrders |
| REQ-execution-graph-compiler-009 / WorkOrderId includes capsule | MUST | `execution-identities/index.js` | covered-by-design | Payload differential |
| REQ-worker-isolation-002 / canonical snapshot decoupled | MUST | Manifest-only lookup | covered-by-design | No extraneous files |
| REQ-worker-isolation-002 / deterministic fingerprint | MUST | Sorted manifest digest | covered-by-design | Cross-workspace |
| REQ-worker-isolation-002 / unrecorded workspace fails | MUST | Private registry guard | covered-by-design | Existing regression |
| REQ-worker-isolation-002 / baseline content preserved | MUST | Workspace record | covered-by-design | Diff generation |
| REQ-worker-isolation-002 / derived map intersected | MUST | Effective-base ∩ manifest | covered-by-design | README excluded |
| REQ-worker-isolation-002 / missing derived input fails | MUST | Resolve-all-before-write | covered-by-design | No worker dispatch |
| REQ-kernel-contract-schemas-023 / valid capsule_inputs pass | MUST | `v2.schema.json` + valid fixtures | covered-by-design | Closed concrete paths |
| REQ-kernel-contract-schemas-023 / missing/empty fail | MUST | Required + minItems fixtures | covered-by-design | Negative fixtures |
| REQ-kernel-contract-schemas-023 / glob/traversal/absolute fail | MUST | Pattern-negative fixtures | covered-by-design | Item constraints |
| REQ-kernel-contract-schemas-023 / v1 and K1 frozen | MUST | `K1_SCHEMA_BASELINE` digest | covered-by-design | Byte-identical pins |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1200 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size:exception`) — apply in 4 logical batches |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema + identity + K4a compiler chain | PR único (batch 1) | Foundation; WorkOrderIds change |
| 2 | K6a intersection materializer | PR único (batch 2) | Depends on schema/capsule_inputs |
| 3 | Parser fail-closed + DAG conflicts + orchestrator wiring | PR único (batch 3) | Integrates compiler + materializer |
| 4 | Comparator projection + 1:N store + E2E | PR único (batch 4) | Final integration; clean store only |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schema and Identity Foundation

- [x] 1.1 RED — Add failing negatives in `scripts/lib/kernel-schema-fixtures.test.js` for omitted/empty/glob/`..`/absolute `capsule_inputs` [REQ-kernel-contract-schemas-023]
- [x] 1.2 GREEN — Require closed `capsule_inputs` in `schemas/kernel/work-order/v2.schema.json`; update/create `schemas/kernel/work-order/fixtures/{valid,invalid}/*.json` [REQ-kernel-contract-schemas-023]
- [x] 1.3 RED — Assert `K1_SCHEMA_BASELINE` and v1 schema bytes unchanged in `kernel-schema-fixtures.test.js` [REQ-kernel-contract-schemas-023]
- [x] 1.4 GREEN — Confirm v1 schema and K1 pins byte-identical; run fixture-family validation [REQ-kernel-contract-schemas-023]
- [x] 1.5 RED — Add differential `computeWorkOrderId` test when `capsule_inputs` differ in `scripts/lib/execution-graph/work-order-compiler.test.js` [REQ-execution-graph-compiler-009]
- [x] 1.6 GREEN — Validate and hash `capsule_inputs` in `scripts/lib/execution-identities/index.js` before ID computation [REQ-execution-graph-compiler-009]

## Phase 2: K4a Capsule Input Compiler

- [x] 2.1 RED — Add failing tests in `work-order-compiler.test.js`: double-compile determinism, inventory `source_snapshot_id` binding, empty/glob atomic failure, zero WorkOrders emitted [REQ-execution-graph-compiler-009]
- [x] 2.2 GREEN — Implement snapshot-bound `context.pathInventory` resolution and sorted unique concrete `capsule_inputs` in `scripts/lib/execution-graph/work-order-compiler.js` [REQ-execution-graph-compiler-009]
- [x] 2.3 RED — Assert post-emission schema validation and `empty-capsule-inputs`/`invalid-capsule-inputs` error codes [REQ-execution-graph-compiler-009]
- [x] 2.4 GREEN — Insert `capsule_inputs` before `computeWorkOrderId()`; fail atomically with zero output on any node violation [REQ-execution-graph-compiler-009]

## Phase 3: K6a Capsule Intersection Materializer

- [x] 3.1 RED — Add failing intersection tests in `scripts/lib/worker-workspace.test.js`: derived map ∩ manifest, missing input, no caller overrides [REQ-worker-isolation-002, REQ-repair-shadow-012]
- [x] 3.2 GREEN — Remove `options.capsule_inputs`/`options.inputs` fallbacks; resolve and write only `effectiveBase.files ∩ capsule_inputs` in `scripts/lib/worker-workspace.js` [REQ-worker-isolation-002]
- [x] 3.3 RED — Add regressions: deterministic fingerprint across workspaces, unrecorded workspace throws, baseline content retained [REQ-worker-isolation-002]
- [x] 3.4 GREEN — Preserve baseline map in workspace record; enforce private-registry guard without Repair imports [REQ-worker-isolation-002]

## Phase 4: Patch Parser Fail-Closed

- [x] 4.1 RED — Add MALFORMED_UNIFIED_DIFF failing cases in `scripts/lib/repair-shadow/index.test.js`: header-only create/delete, empty non-hunk patch, truncated `@@` [REQ-repair-shadow-010]
- [x] 4.2 GREEN — Implement structured `parseUnifiedDiffs` terminal validation in `scripts/lib/repair-shadow/patch-integrator.js`; reject before `freezeCandidate()` [REQ-repair-shadow-010]
- [x] 4.3 RED — Assert mode-only existing-path diff succeeds and updates `changed_paths_modes_digest`/`CandidateId` [REQ-repair-shadow-010]
- [x] 4.4 GREEN — Classify mode-only sections separately from header-only create/delete; forward modes to K3 [REQ-repair-shadow-010]

## Phase 5: DAG Predecessor Conflict Detection

- [x] 5.1 RED — Add failing DAG tests in `index.test.js`: ancestor chain overlap OK, incomparable diamond `PREDECESSOR_CONTEXT_CONFLICT`, predecessor-subset filtering [REQ-repair-shadow-011]
- [x] 5.2 GREEN — Implement `detectPredecessorContextConflicts({ node_id, workResult }, predecessors, ancestorClosure)` in `patch-integrator.js` [REQ-repair-shadow-011]
- [x] 5.3 RED — Assert `freezeCandidate` not invoked on conflict; chain regression passes [REQ-repair-shadow-011]
- [x] 5.4 GREEN — Wire ancestor-closure map and per-node predecessor metadata in `scripts/lib/repair-shadow/orchestrator.js` [REQ-repair-shadow-011]

## Phase 6: Orchestrator Materialization Wiring

- [x] 6.1 RED — Add call-spy test: EffectiveShadowBase with extra paths; only `capsule_inputs` materialized; missing path blocks `executeWorkOrder` [REQ-repair-shadow-012]
- [x] 6.2 GREEN — Pass compiled WorkOrder v2 unchanged to K6a; bind `pathInventory` from orchestrator options in `orchestrator.js` [REQ-repair-shadow-012]
- [x] 6.3 RED — Assert no files/worker dispatch on materialization failure in integration path [REQ-repair-shadow-012, REQ-worker-isolation-002]
- [x] 6.4 GREEN — Connect inventory builder from validated SourceSnapshot + `options.files` [REQ-repair-shadow-012, REQ-execution-graph-compiler-009]

## Phase 7: Canonical Comparison Projection

- [x] 7.1 RED — Add failing projection tests: topological `node_id` steps, all seven dimension keys, empty arrays evaluated [REQ-repair-shadow-006]
- [x] 7.2 GREEN — Implement `buildComparisonProjection({ executionGraph, candidate, workResults, graphTelemetry })` in `scripts/lib/repair-shadow/shadow-comparator.js` [REQ-repair-shadow-006]
- [x] 7.3 RED — Assert `INVALID_COMPARISON_PROJECTION` when steps lack graph-derived `node_id` sequence; operation/WO-id must not match [REQ-repair-shadow-006]
- [x] 7.4 GREEN — Validate projection `kind: "repair-shadow-comparison-projection/v1"` and required keys before compare [REQ-repair-shadow-006]
- [x] 7.5 RED — Add match/discrepancy telemetry, non-mutation before/after production snapshot, `skipped_dimensions` empty for seven dims [REQ-repair-shadow-006]
- [x] 7.6 GREEN — Refactor `compareShadowExecution` to compare only validated projections; record telemetry without halting production [REQ-repair-shadow-006]

## Phase 8: Execution Record Store 1:N

- [x] 8.1 RED — Add store failing tests: two distinct records same CandidateId, byte-identical idempotent persist, incomplete bindings reject [REQ-repair-shadow-009]
- [x] 8.2 GREEN — Restructure `execution-record-store.js` to `{ records: { [fingerprint] }, by_candidate: { [id]: [fp] } }` with CAS over both maps [REQ-repair-shadow-009]
- [x] 8.3 RED — Assert plural `loadRepairShadowExecutions(store, candidateId)` returns defensive copies; four-identity chain unchanged [REQ-repair-shadow-009]
- [x] 8.4 GREEN — Export plural query from `scripts/lib/repair-shadow/index.js`; fingerprint via `sha256Fingerprint("repair-shadow-execution-record/v1", record)` [REQ-repair-shadow-009]
- [x] 8.5 RED — Assert legacy CandidateId-keyed layout rejected fail-closed on persist/load [REQ-repair-shadow-009]
- [x] 8.6 GREEN — Document clean-store requirement; no implicit migration of partial records [REQ-repair-shadow-009]

## Phase 9: End-to-End Integration

- [x] 9.1 RED — Update `scripts/k4b-repair-shadow-e2e.test.js` with concrete `capsule_inputs` fixtures; failing audit plural query and Option A chain [REQ-repair-shadow-006, REQ-repair-shadow-009, REQ-repair-shadow-012]
- [x] 9.2 GREEN — Update all v2 WorkOrder callers/fixtures; wire orchestrator finalize → store persist → projection compare [REQ-repair-shadow-009, REQ-repair-shadow-006]
- [x] 9.3 Verify — Run targeted suites then `npm test`; confirm no freeze on malformed/conflicting patches and no promotion on binding failure [REQ-repair-shadow-010, REQ-repair-shadow-011, REQ-repair-shadow-009]
