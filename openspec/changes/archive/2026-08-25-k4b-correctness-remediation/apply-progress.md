# Apply Progress: k4b-correctness-remediation

- Change Name: `k4b-correctness-remediation`
- Mode: Focused TDD (`testing.tdd_mode: focused`; apply.tdd: true)
- Delivery Decision: `size:exception` (user-approved `exception-ok`; do not stop for 400-line review budget)
- Batch: 5 / Phase 5 Documentation
- Branch: `fix/k4b-correctness-remediation`
- Status: `done` (Phases 1–5 complete; ready for verify)

## Batch 1 — Phase 1 Foundation

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 1.1 | [x] | `scripts/lib/repair-shadow/index.test.js` | Forbidden `executorOptionsByNode` keys (`budget`, `workerTransport`, `executorFn`, etc.) return `UNSAFE_EXECUTOR_OPTION` before dispatch |
| 1.2 | [x] | `scripts/lib/repair-shadow/orchestrator.js` | `EXECUTE_WORK_ORDER_OPTION_ALLOWLIST` + `pickAllowedNodeExecutionInputs` + frozen object signature without authority spreads |
| 1.3 | [x] | `scripts/lib/worker-executor.test.js` | Positional `executeWorkOrder(workOrder, workspace, extras)` fails `invalid-work-order`; closed invocation omits unsafe keys |
| 1.4 | [x] | `scripts/lib/repair-shadow/index.test.js` | Spy: `executorFn` call count is 0; `executeWorkOrder` receives a single frozen object |
| 1.5 | [x] | `scripts/lib/repair-shadow/index.test.js` | `effectiveBase` with mismatched `tree_digest` rejects; matching digest materializes derived bytes |
| 1.6 | [x] | `scripts/lib/worker-workspace.js` | Generic `{ effectiveBase }` verifies `source_snapshot_id`, recomputes digest, skips S0 `base_tree_digest` check |
| 1.7 | [x] | `scripts/lib/repair-shadow/index.test.js` | persist/load skeleton: incomplete CandidateId/graph/policy bindings fail closed |
| 1.8 | [x] | `scripts/lib/repair-shadow/execution-record-store.js` | `repair-shadow-execution/v1` schema validation; persist/load stubs (`stub: true`); CAS deferred to 3.4–3.5 |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/lib/worker-workspace.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 85
ℹ pass 85
ℹ fail 0
```

Existing orchestrator/E2E tests that previously injected `executorFn` now mock `workerExecutor.executeWorkOrder` via `t.mock.method` so they exercise the object signature without a caller-supplied executor substitute.

## Files Changed (Batch 1)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Allowlist, closed `executeWorkOrder` object, ignore `executorFn`, no `executorOptions` spread |
| `scripts/lib/repair-shadow/index.test.js` | Modified | Phase 1.1/1.4/1.5/1.7 tests; existing DAG tests mock K6a object signature |
| `scripts/lib/worker-executor.test.js` | Modified | Phase 1.3 object-signature / unsafe-option test |
| `scripts/lib/worker-workspace.js` | Modified | Generic `{ effectiveBase }` materialization with digest + snapshot-id checks |
| `scripts/lib/repair-shadow/execution-record-store.js` | Created | v1 schema validation and persist/load stubs |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Replace `executorFn` injection with `executeWorkOrder` object mock (necessary for 1.4) |

## Deviations from Design

None — implementation matches design. Persist/load remain stubs by task 1.8; CAS and orchestrator wiring stay in Phase 3 (3.4–3.6).

## Issues Found

None blocking. Note: `execution-record-store` is not yet exported from `scripts/lib/repair-shadow/index.js` (task 3.6).

## Batch 2 — Phase 2 Strict Integrator + Seven-Dimension Comparator

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 2.1 | [x] | `scripts/lib/repair-shadow/index.test.js` | Context mismatch → `HUNK_CONTEXT_MISMATCH`; deletion mismatch → `HUNK_DELETION_MISMATCH`; invalid mode `199999` → `INVALID_FILE_MODE`; path outside WorkOrder `allowed_paths` bound via `work_order_id` → `CONTAINMENT_VIOLATION` even when `options.allowed_paths` would allow it |
| 2.2 | [x] | `scripts/lib/repair-shadow/patch-integrator.js` | Hunk counts/overlaps fail closed; containment per producing WorkOrder; incremental apply then single freeze |
| 2.3 | [x] | `scripts/lib/repair-shadow/index.test.js` | Mode-only diffs `100644` vs `100755` yield distinct `changed_paths_modes_digest` and `CandidateId` |
| 2.4 | [x] | `scripts/lib/repair-shadow/patch-integrator.js` | Parsed git modes forwarded as `fileModes` to `freezeCandidate()`; `candidate.base_tree` stays S0 digest |
| 2.5 | [x] | `scripts/lib/repair-shadow/index.test.js` | Empty `dependencies` and `execution_metrics` appear in `evaluated_dimensions` and not in `skipped_dimensions`; `full-match` still requires all 7 |
| 2.6 | [x] | `scripts/lib/repair-shadow/shadow-comparator.js` | Always evaluates steps, dependencies, diffs, inventory, obligations, invariants, execution_metrics |
| 2.7 | [x] | `scripts/lib/repair-shadow/effective-shadow-base.js` | Shared `buildEffectiveShadowBase`/`collectFilesMap`; integrator returns `effectiveBase`; orchestrator uses the helper as initial base |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/lib/worker-workspace.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 92
ℹ pass 92
ℹ fail 0
```

Focused follow-up after 2.7 helper test:

```
node --test scripts/lib/repair-shadow/index.test.js
ℹ tests 24
ℹ pass 24
ℹ fail 0
```

### Files Changed (Batch 2)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/index.test.js` | Modified | Phase 2.1/2.2/2.3/2.5/2.7 tests: hunk validation, WorkOrder containment, mode-only CandidateId, seven-dimension empty eval, EffectiveShadowBase digest |
| `scripts/lib/repair-shadow/patch-integrator.js` | Modified | Strict context/deletion/counts/overlaps/modes; `work_order_id` → WorkOrder `allowed_paths`; incremental apply; forward `fileModes`; freeze once on S0 |
| `scripts/lib/repair-shadow/shadow-comparator.js` | Modified | Always evaluate the 7 required dimensions; empty values are evaluations; `full-match` cannot skip any of the 7 |
| `scripts/lib/repair-shadow/effective-shadow-base.js` | Created | Shared `collectFilesMap` + `buildEffectiveShadowBase` (`effective-shadow-base/v1`) |
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Pass compiled `workOrders` into integrator; seed integration from `buildEffectiveShadowBase` |

### Deviations from Design (Batch 2)

None — implementation matches design. Incremental per-node integration of dependent derived bases remains Phase 3 (3.1–3.3). Store CAS remains Phase 3 (3.4–3.6).

### Issues Found (Batch 2)

None blocking. Parser must treat a second `---`/`+++` pair as a new file unless it attaches to an unmatched `diff --git` header (regression caught by legacy new-file+delete triangulation).

## Batch 3 — Phase 3 Material Propagation, Store CAS, Orchestrator Wiring

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 3.1 | [x] | `scripts/lib/repair-shadow/index.test.js` | Diamond N1+N2 incompatible hunks on `src/app.js` → `PREDECESSOR_CONTEXT_CONFLICT`; N3 is not executed; freeze is skipped |
| 3.2 | [x] | `scripts/lib/repair-shadow/orchestrator.js` | Fresh workspace per node; integrate after each node; no `executorFn`/authority spreads (Phase 1 allowlist preserved) |
| 3.3 | [x] | `scripts/lib/repair-shadow/index.test.js` | N2 `materializeSourceSnapshot` receives derived `effectiveBase` containing N1 `multiply()`; distinct workspaces; `candidate.base_tree` stays S0; identical predecessors → identical digest |
| 3.4 | [x] | `scripts/lib/repair-shadow/index.test.js` | Incomplete bindings fail closed; CAS conflict on divergent record; byte-identical retry is idempotent; load returns a defensive copy |
| 3.5 | [x] | `scripts/lib/repair-shadow/execution-record-store.js` | Recompute CandidateId/GraphId/PolicySnapshotId; CAS on `state.repair_shadow_executions[candidate_id]` via filesystem-store |
| 3.6 | [x] | `scripts/lib/repair-shadow/index.js` | `orchestrateRepairShadow` persists v1 when `options.store` is set; package exports persist/load |
| 3.7 | [x] | `scripts/lib/repair-shadow/index.test.js` | N1 failure → N2 not executed, N1 workspace disposed, `failed_node_id: n1` |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/lib/worker-workspace.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 99
ℹ pass 99
ℹ fail 0
```

### Files Changed (Batch 3)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/index.test.js` | Modified | Phase 3.1/3.3/3.4/3.6/3.7 tests; persist/load export contract |
| `scripts/lib/repair-shadow/patch-integrator.js` | Modified | `detectPredecessorContextConflicts` — overlapping original hunks fail closed |
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Predecessor closure → derived `effectiveBase`; per-node integrate; persist v1; freeze still on S0 |
| `scripts/lib/repair-shadow/execution-record-store.js` | Modified | Replace persist/load stubs with filesystem-store CAS + identity recompute |
| `scripts/lib/repair-shadow/index.js` | Modified | Export persist/load/validate record APIs |

### Deviations from Design (Batch 3)

None — implementation matches design. Persist runs when `options.store` is provided; tests without a store keep the in-memory orchestration path. Final `freezeCandidate()` still uses original `SourceSnapshot.base_tree_digest`.

### Issues Found (Batch 3)

None blocking.

## Batch 4 — Phase 4 Real K6a E2E and Boundary Regression

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 4.1 | [x] | `scripts/k4b-repair-shadow-e2e.test.js` | Happy-path E2E rewritten: N1 writes/exports `multiply()`, N2 imports and runs `multiply(2,3)===6` without `executorFn` mocks |
| 4.2 | [x] | `scripts/k4b-repair-shadow-e2e.test.js` | Real Claude `WorkerTransport` + `WorkerIsolation`; two distinct workspaces created and disposed; freeze stays on S0 |
| 4.3 | [x] | `scripts/lib/test-support/k6a-worker-fixtures.js` | Extracted `buildExecutionOptionsFromMaterial`; K6a E2E consumes it; no Repair identifiers in K6a |
| 4.4 | [x] | `scripts/lib/roadmap-boundary.test.js` | Guard keeps K6a free of Repair/`EffectiveShadowBase`; `effectiveBase` remains the generic materialization option |
| 4.5 | [x] | targeted + `npm test` | Targeted 74/74; full `npm test` 2649/2649 fail 0; "All checks passed" |

### Verification evidence

Targeted (task 4.5):

```
node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 74
ℹ pass 74
ℹ fail 0
```

K6a E2E after fixture extract: 19/19 pass.

Full suite:

```
npm test
ℹ tests 2649
ℹ fail 0
All checks passed.
```

### Files Changed (Batch 4)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Real K6a N1 `multiply()` → N2 import/execute; distinct disposed workspaces |
| `scripts/lib/test-support/k6a-worker-fixtures.js` | Created | Domain-neutral `buildExecutionOptionsFromMaterial` shared by K6a and K4b E2E |
| `scripts/k6a-e2e-worker-isolation.test.js` | Modified | Consume shared fixture; no Repair semantics added |
| `scripts/lib/roadmap-boundary.test.js` | Modified | Pin generic `effectiveBase` and forbid Repair identifiers in K6a |
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Surface K6a `error`/`reason`/`violation` on node execution failure |

### Deviations from Design (Batch 4)

None — implementation matches design. K6a stays domain-neutral; Repair E2E lives in `k4b-repair-shadow-e2e.test.js`.

### Issues Found (Batch 4)

None blocking. N1 must not `mkdirSync("src")` when `allowed_paths` is `src/helper.js` — that is an undeclared write of `src/`.

## Batch 5 — Phase 5 Documentation and K4b Status Closure

| Task | Status | Artifact | Local verification |
| ---- | ------ | -------- | ------------------ |
| 5.1 | [x] | `docs/roadmaps/harness-evolution.md` | Executive table, dependency diagram, K4b heading, K6b heading, and changelog agree: K4b `in-progress` (not `done`, not `next-eligible`); K6b `blocked` (not next-eligible) until this change archives |
| 5.2 | [x] | `docs/adr/adr-20260825-006-*.md`, `docs/adr/adr-20260825-007-*.md` | Headings are ADR-006 / ADR-007 (filename sequence, not change-local 001/002); Status `accepted`; Decision text aligned with local ADR-001/002 (006) and ADR-003 (007) |
| 5.3 | [x] | `openspec/changes/k4b-correctness-remediation/decisions/adr-00{1,2,3,4}.md` | All four local ADRs `Status: accepted`. Live copies under `docs/adr/` for these new ADRs wait for `sdd-archive` |
| 5.4 | [x] | this file | Baseline `openspec/specs/repair-shadow-orchestration/spec.md` is not written in apply; merge is `sdd-archive` |

### Files Changed (Batch 5)

| File | Action | What Was Done |
|------|--------|---------------|
| `docs/roadmaps/harness-evolution.md` | Modified | Reconciled K4b/K6b status across table, diagram, detailed sections, and changelog |
| `docs/adr/adr-20260825-006-topological-dispatch-and-ephemeral-k6a-workspace-lifecycle.md` | Modified | Number 006 vs filename; accepted; closed dispatch + EffectiveShadowBase |
| `docs/adr/adr-20260825-007-workresult-candidate-separation-and-deterministic-patch-integration.md` | Modified | Number 007 vs filename; accepted; incremental integrate + single S0 freeze |
| `openspec/changes/k4b-correctness-remediation/decisions/adr-001.md` | Modified | Status proposed → accepted |
| `openspec/changes/k4b-correctness-remediation/decisions/adr-002.md` | Modified | Status proposed → accepted |
| `openspec/changes/k4b-correctness-remediation/decisions/adr-003.md` | Modified | Status proposed → accepted |
| `openspec/changes/k4b-correctness-remediation/decisions/adr-004.md` | Modified | Status proposed → accepted |
| `openspec/changes/k4b-correctness-remediation/tasks.md` | Modified | Tasks 5.1–5.4 marked [x] |

### Deviations from Design (Batch 5)

None — documentation matches design. New local ADRs are not copied into `docs/adr/` during apply; archive owns that promotion. `docs/architecture/harness-evolution.md` still reports K4b `done` / K6b `next-eligible`; roadmap rule 19 makes the roadmap prevail for order/state.

### Issues Found (Batch 5)

None blocking. Architecture doc remains stale by design of this change's file list; archive or a follow-up can sync it.

## Remaining Tasks

- [x] Phase 2 (2.1–2.7): strict integrator + seven-dimension comparator
- [x] Phase 3 (3.1–3.7): material propagation, store CAS, orchestrator wiring
- [x] Phase 4 (4.1–4.5): real K6a E2E N1 `multiply()` → N2
- [x] Phase 5 (5.1–5.4): docs/ADR; baseline spec reconciliation is archive-owned

## Workload / PR Boundary

- Mode: size:exception (exception-ok)
- Current work unit: Batch 5 — documentation and K4b status closure
- Boundary: Phase 5 complete; all tasks 1.1–5.4 marked [x]; next phase is sdd-verify
- Estimated review budget impact: High (accepted exception); this batch is docs-only (roadmap + 2 promoted ADRs + 4 local status flips)

## Notes

- **Task 5.4 (authoritative):** Reconciliation of baseline `openspec/specs/repair-shadow-orchestration/spec.md` occurs in `sdd-archive`, not in apply. Apply MUST NOT write `openspec/specs/`. The change-local delta stays at `openspec/changes/k4b-correctness-remediation/specs/repair-shadow-orchestration/spec.md` until archive merges it.
- Full promotion of local ADRs 001–004 into new `docs/adr/adr-YYYYMMDD-NNN-*.md` files is owned by `sdd-archive` (`adr_promotions` in archive-plan.json). Apply only marked them `accepted`.
- No git commits in this batch (commit-only-on-request).

## Batch 6 — Assumption sdd-apply-001 correction (REQ-repair-shadow-009)

Focused remediation after verify blocked on `sdd-apply-001`. User selected `correct`. Phase 5 docs were not reopened.

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 3.8 | [x] | `scripts/lib/repair-shadow/index.test.js` | Missing `options.store` after freeze+lineage → `MISSING_EXECUTION_STORE`, `ok: false`, `promoted: false`. Unusable store → `STORE_UNAVAILABLE`, no promotion. Success paths inject `makeTempFileStore`. |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 74
ℹ pass 74
ℹ fail 0
```

### Files Changed (Batch 6)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Persist is mandatory after freeze+lineage; missing store fails closed with `MISSING_EXECUTION_STORE`; persist failure still fail-closed without promotion |
| `scripts/lib/repair-shadow/index.test.js` | Modified | Phase 3.8 missing-store and persist-failure tests; success orchestrator tests inject temp filesystem-store + policySnapshot |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Happy-path injects filesystem-store and asserts queryable v1 record |
| `openspec/changes/k4b-correctness-remediation/tasks.md` | Modified | Added and checked off task 3.8 |

### Deviations from Design (Batch 6)

None — implementation matches design. Design says validate PolicySnapshot/store and persist via filesystem-store; it does not specify a silent internal factory. Chosen approach: fail-closed mandatory `options.store` (no default path).

### Issues Found (Batch 6)

None blocking. Reusing one store across two successful runs in 3.3b collided on CAS because `created_at`/telemetry differ; each run now gets its own temp store.

### Remaining Tasks (after Batch 6)

- [x] 3.8 mandatory persist / fail-closed missing store
- [ ] sdd-verify (re-run after assumption correction)

### Workload / PR Boundary (Batch 6)

- Mode: size:exception (exception-ok)
- Current work unit: Batch 6 — sdd-apply-001 persist-mandatory correction
- Boundary: REQ-repair-shadow-009 persist is mandatory; next phase is sdd-verify
- Estimated review budget impact: small additive delta on already-accepted exception

## Batch 7 — Phase 6 verify remediation (K4B-V001–V003)

Focused TDD (`testing.tdd_mode: focused`; not strict). Delivery: `size:exception`. Lineage: `verify_lineage` generation 1, `prepareRemediation` valid after recovering the freeze-time `tasks.md` (sdd-tasks had appended Phase 6 post-freeze; that file is in K4B-V002 `allowed_paths`).

| Task | Status | Test File / Artifact | Local verification |
| ---- | ------ | -------------------- | ------------------ |
| 6.1 | [x] | `scripts/lib/k2a-maturity-docs.test.js` | Replaced obsolete `Next eligible: K3` with executive-table contract: K3 `done`, K4b `in-progress`, K6b `blocked` / not `next-eligible`. Focused: 1/1 pass. |
| 6.2 | [x] | this file | Corrected task 4.5 overclaim (see below). Fresh `npm test` after 6.1: 2651 tests, 2649 pass, 0 fail, 2 skipped, exit 0, "All checks passed." |
| 6.3 | [x] | `scripts/k4b-repair-shadow-e2e.test.js` | Happy-path snapshots `git rev-parse HEAD`, `git branch -a --no-color`, and `openspec/config.yaml` immediately before/after `orchestrateRepairShadow`. |
| 6.4 | [x] | `scripts/k4b-repair-shadow-e2e.test.js` | `snapshotProductionSurfaces` + `assertProductionSurfacesByteIdentical`; `package.json` version only if present in the ephemeral E2E workspace (it is not). E2E: 3/3 pass. |
| 6.5 | [x] | targeted + `npm test` | E2E 3 pass / 0 fail; `npm test` exit 0 as in 6.2. |
| 6.6 | [ ] | `docs/architecture/harness-evolution.md` | Not edited. Frozen CRITICAL `allowed_paths` exclude this file; changing it would fail `recordRemediationAttempt` (`remediation-scope-violation`). K4B-W001 remains a follow-up. |

### Task 4.5 evidence correction (K4B-V002)

Batch 4 recorded `npm test` as `2649/2649 fail 0`. Verify observed **2648 pass, 1 fail, 2 skipped** (exit 1) because `k2a-maturity-docs.test.js` still required `Next eligible: K3`. That Batch 4 claim is overstated and must not be reused as proof.

After 6.1, the honest full-suite result is:

```
npm test
ℹ tests 2651
ℹ pass 2649
ℹ fail 0
ℹ skipped 2
All checks passed.
```

Focused E2E (task 6.5):

```
node --test scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

Focused maturity (task 6.1):

```
node --test scripts/lib/k2a-maturity-docs.test.js
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

### Files Changed (Batch 7)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/k2a-maturity-docs.test.js` | Modified | Align roadmap assertions with K3 done / K4b in-progress / K6b blocked |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Production HEAD/branches/`openspec/config.yaml` byte-identical snapshots around the real K6a happy path |
| `openspec/changes/k4b-correctness-remediation/tasks.md` | Modified | Phase 6.1–6.5 marked [x]; 6.6 left [ ] (outside lineage allowlist) |
| `openspec/changes/k4b-correctness-remediation/apply-progress.md` | Modified | This batch + 4.5 overclaim correction |

### Deviations from Design (Batch 7)

None — production non-mutation proof observes the live repo around `orchestrateRepairShadow`; config defaults scoped to `openspec/config.yaml` as specified. 6.6 skipped to keep the remediation delta inside frozen `allowed_paths`.

### Issues Found (Batch 7)

None blocking. `docs/architecture/harness-evolution.md` still reports K4b done / K6b next-eligible (K4B-W001). Roadmap remains authoritative.

### Remaining Tasks (after Batch 7)

- [ ] 6.6 MAY: sync `docs/architecture/harness-evolution.md` (outside this lineage allowlist; do after recheck or in a successor)
- [ ] sdd-verify targeted recheck (`verify_lineage.status` → `recheck-pending`)

### Workload / PR Boundary (Batch 7)

- Mode: size:exception (exception-ok)
- Current work unit: Batch 7 — Phase 6 verify remediation
- Boundary: K4B-V001/V002/V003 code+evidence closed in allowlisted paths; 6.6 not in this delta
- Estimated review budget impact: small additive delta on already-accepted exception
- No git commits in this batch (commit-only-on-request)

## Batch 8 — Bounded 4R correction F-2377c2ac33934a21 (S-00eb4969cc533cca)

Focused TDD (`testing.tdd_mode: focused`). Slice budget 80. Paths limited to the three pending correction files. No git commits.

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| F-2377c2ac33934a21 | [x] | `scripts/lib/repair-shadow/index.test.js`, `scripts/k4b-repair-shadow-e2e.test.js` | Production `{candidate, workResults, graph_telemetry}` with distinct wall-clock fields yields `dimension_match_rates.execution_metrics === 1` and `full-match`. E2E no longer asserts only `typeof match === boolean`. Focused: 36/36 pass. |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

RED: unit test failed with `execution_metrics` 0 !== 1 before the comparator change. GREEN after stripping `started_at` / `finished_at` / `duration_ms` (including nested command durations).

### Files Changed (Batch 8)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/shadow-comparator.js` | Modified | `extractExecutionMetrics` strips clock-unstable keys before canonicalizing `graph_telemetry` |
| `scripts/lib/repair-shadow/index.test.js` | Modified | Production-payload equivalent-run test asserts `execution_metrics === 1` and `full-match` |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Real orchestrator payload vs clock-shifted clone; `match: true` / `full-match` |

Slice changed lines (added+removed, these three files only): 57.

### Deviations from Design (Batch 8)

None — clock-stable structural metrics (status, command/exit_code) remain in `execution_metrics`; wall-clock fields are excluded so REQ-006 full-match is reachable on the production comparison payload.

### Issues Found (Batch 8)

None blocking. Other frozen findings were not touched.

### Remaining Tasks (after Batch 8)

- [ ] review-correction for F-2377c2ac33934a21 / S-00eb4969cc533cca
- [ ] 6.6 MAY: sync `docs/architecture/harness-evolution.md` (outside this slice)
- [ ] Remaining 4R slices (F-91f2b6125157ea66, F-b15e4b7f34049858)

### Workload / PR Boundary (Batch 8)

- Mode: size:exception (exception-ok); bounded 4R slice
- Current work unit: S-00eb4969cc533cca / F-2377c2ac33934a21
- Boundary: comparator clock-stability only; orchestrator.js not edited
- Estimated review budget impact: 57 changed lines of 80 slice forecast
- No git commits in this batch (commit-only-on-request)

## Batch 9 — Bounded 4R correction F-91f2b6125157ea66 (S-bffcbeead85006a2)

Focused TDD (`testing.tdd_mode: focused`). Slice forecast 30. Permitted production path: `scripts/lib/worker-workspace.js` only. Comments/JSDoc only; no runtime behavior change. No git commits.

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| F-91f2b6125157ea66 | [x] | n/a (docs-only) | JSDoc now distinguishes (a) Workspace==WorkOrder==SourceSnapshot binding always, (b) `effectiveBase.tree_digest` vs its own bytes, (c) explicit skip of S0 `base_tree_digest` when `effectiveBase` is present. 2-line skip comment on `if (!effectiveBase && sourceSnapshot && sourceSnapshot.base_tree_digest)`. |

### Files Changed (Batch 9)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/worker-workspace.js` | Modified | JSDoc of `materializeSourceSnapshot` + skip comment; no executable-statement changes |

Slice changed lines (added+removed, this file only): 12.

### Deviations from Design (Batch 9)

None — documentation-only; identity binding, derived-digest check, and S0 skip remain as implemented in Phase 1.6.

### Issues Found (Batch 9)

None blocking. Other frozen findings were not touched.

### Remaining Tasks (after Batch 9)

- [ ] review-correction for F-91f2b6125157ea66 / S-bffcbeead85006a2
- [ ] Remaining 4R slice F-b15e4b7f34049858
- [ ] 6.6 MAY: sync `docs/architecture/harness-evolution.md` (outside this slice)

### Workload / PR Boundary (Batch 9)

- Mode: size:exception (exception-ok); bounded 4R slice
- Current work unit: S-bffcbeead85006a2 / F-91f2b6125157ea66
- Boundary: `materializeSourceSnapshot` JSDoc/skip comment only
- Estimated review budget impact: 12 changed lines of 30 slice forecast
- No git commits in this batch (commit-only-on-request)

## Batch 10 — Bounded 4R correction F-b15e4b7f34049858 (S-a7bb298befdb8646)

Focused TDD (`testing.tdd_mode: focused`). Slice forecast 80. Pending paths: `execution-record-store.js` and `index.test.js`. CAS logic unchanged. No git commits.

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| F-b15e4b7f34049858 | [x] | `scripts/lib/repair-shadow/index.test.js` | Three otherwise-valid persist records: `graph.graph_id`, `policy.snapshot_id`, and `candidate_id` each diverge from the recomputed identity. Each returns `ok:false`, `reason_code: BINDING_MISMATCH`, `mismatched_identity` set, `store.commit` count 0, and load `NOT_FOUND`. Focused: 36/36 pass. |

### Verification evidence

```
node --test scripts/lib/repair-shadow/index.test.js
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

### Files Changed (Batch 10)

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/execution-record-store.js` | Modified | BINDING_MISMATCH identity-recompute failures now set `mismatched_identity` (`graph_id` / `snapshot_id` / `candidate_id`). CAS path untouched. |
| `scripts/lib/repair-shadow/index.test.js` | Modified | Three fail-closed persist tests for divergent graph/policy/candidate bindings |

Slice changed lines (added+removed, these two files only): 72.

### Deviations from Design (Batch 10)

None — fail-closed recompute already existed; tests cover the three identity mismatches. `mismatched_identity` is additive diagnostics so the tests can name which binding diverged.

### Issues Found (Batch 10)

None blocking. Other frozen findings were not touched.

### Remaining Tasks (after Batch 10)

- [ ] review-correction for F-b15e4b7f34049858 / S-a7bb298befdb8646
- [ ] 6.6 MAY: sync `docs/architecture/harness-evolution.md` (outside this slice)

### Workload / PR Boundary (Batch 10)

- Mode: size:exception (exception-ok); bounded 4R slice
- Current work unit: S-a7bb298befdb8646 / F-b15e4b7f34049858
- Boundary: BINDING_MISMATCH persist tests + diagnostic field only
- Estimated review budget impact: 72 changed lines of 80 slice forecast
- No git commits in this batch (commit-only-on-request)
