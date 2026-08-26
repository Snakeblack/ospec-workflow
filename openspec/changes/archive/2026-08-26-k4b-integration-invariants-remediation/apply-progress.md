# Apply Progress: k4b-integration-invariants-remediation

- Change Name: `k4b-integration-invariants-remediation`
- Mode: Focused TDD (`testing.tdd_mode: focused`; RED → GREEN per new behavior)
- Delivery Decision: `size:exception` (approved `exception-ok`; all 41 tasks in one apply run)
- Branch: `fix/k4b-integration-invariants-remediation`
- Status: `done` (Phases 1–9 complete; ready for verify)

## Batch 1 — Schema + identity + K4a (tasks 1.1–2.4)

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 1.1–1.4 | [x] | `scripts/lib/kernel-schema-fixtures.test.js` | v2 requires closed `capsule_inputs`; v1/K1 pins unchanged |
| 1.5–1.6 | [x] | `scripts/lib/execution-graph/work-order-compiler.test.js`, `scripts/lib/execution-identities/index.test.js` | `computeWorkOrderId` v2 hashes sorted unique `capsule_inputs` |
| 2.1–2.4 | [x] | `scripts/lib/execution-graph/work-order-compiler.test.js` | Snapshot-bound `pathInventory`; empty/glob fail atomically with zero WOs |

JSON Schema interpreter now honors `minItems`/`uniqueItems` so the v2 empty-array fixture can fail closed (existing helper extension, not a new domain identity).

## Batch 2 — K6a intersection (tasks 3.1–3.4)

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 3.1–3.2 | [x] | `scripts/lib/worker-workspace.test.js` | Manifest-only `workOrder.capsule_inputs`; `effectiveBase.files ∩ capsule_inputs`; extras never written |
| 3.3–3.4 | [x] | `scripts/lib/worker-workspace.test.js` | Deterministic fingerprint, unrecorded workspace, baseline map retained |

Caller overrides `options.capsule_inputs` / `options.inputs` were removed. Missing derived inputs throw before disk writes.

## Batch 3 — Parser + DAG + orchestrator (tasks 4.1–6.4)

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 4.1–4.4 | [x] | `scripts/lib/repair-shadow/index.test.js` | Header-only create/delete, truncated `@@`, non-hunk text → `MALFORMED_UNIFIED_DIFF`; mode-only remains valid |
| 5.1–5.4 | [x] | `scripts/lib/repair-shadow/index.test.js` | Ancestor-descendant overlap OK; incomparable diamond `PREDECESSOR_CONTEXT_CONFLICT`; subset not contaminated |
| 6.1–6.4 | [x] | `scripts/lib/repair-shadow/index.test.js` | WorkOrder v2 passed unchanged; inventory from `options.files`; missing capsule blocks `executeWorkOrder` |

`parseUnifiedDiffs` now returns `{ ok, files, modeOnly, reason_code? }`. Conflicts compare only incomparable DAG nodes via ancestor closure.

## Batch 4 — Comparator + store 1:N + E2E (tasks 7.1–9.3)

| Task | Status | Test File | Local verification |
| ---- | ------ | --------- | ------------------ |
| 7.1–7.6 | [x] | `scripts/lib/repair-shadow/index.test.js` | Projection `kind: repair-shadow-comparison-projection/v1`; `steps` = topological `node_id`; invalid inputs `INVALID_COMPARISON_PROJECTION` |
| 8.1–8.6 | [x] | `scripts/lib/repair-shadow/index.test.js` | `{ records, by_candidate }` fingerprint index; N records per CandidateId; byte-identical idempotent; legacy layout `LEGACY_LAYOUT_REJECTED` |
| 9.1–9.3 | [x] | `scripts/k4b-repair-shadow-e2e.test.js` plus `npm test` | Option A extras excluded; plural query; fingerprint is storage metadata not a fifth identity |

Orchestrator `execution_record_id` is the internal record fingerprint (not CandidateId). Replay/K4a glob graphs compile via snapshot-bound `defaultPathInventory`.

## Verification evidence

```
node --test scripts/lib/kernel-schema-fixtures.test.js scripts/lib/execution-graph/work-order-compiler.test.js scripts/lib/execution-identities/index.test.js scripts/lib/worker-workspace.test.js scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js
npm test
All checks passed.
```

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `schemas/kernel/work-order/v2.schema.json` | Modified | Required closed concrete `capsule_inputs` (`minItems`, `uniqueItems`, path pattern) |
| `schemas/kernel/work-order/fixtures/**` | Modified/Created | Valid v2 includes `capsule_inputs`; invalid missing/empty/glob/traversal/absolute |
| `scripts/lib/kernel-schema-validator.js` | Modified | Interpret `minItems` and `uniqueItems` |
| `scripts/lib/execution-identities/index.js` | Modified | Normalize/hash v2 `capsule_inputs` before WorkOrderId |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modified | `pathInventory` resolution; emit sorted unique `capsule_inputs`; `defaultPathInventory` helper |
| `scripts/lib/worker-workspace.js` | Modified | Option A intersection; drop caller capsule fallbacks |
| `scripts/lib/repair-shadow/patch-integrator.js` | Modified | Structured parse fail-closed; DAG-incomparable predecessor conflicts |
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Inventory wiring; ancestor closure; projection compare; persist fingerprint id |
| `scripts/lib/repair-shadow/shadow-comparator.js` | Modified | `buildComparisonProjection`; compare only validated projections |
| `scripts/lib/repair-shadow/execution-record-store.js` | Modified | 1:N fingerprint store + CandidateId secondary index; reject legacy layout |
| `scripts/lib/repair-shadow/index.js` | Modified | Export projection builder and plural load |
| `scripts/lib/execution-graph/replay-engine.js` | Modified | Compile v2 with snapshot-bound default inventory |
| Callers/fixtures/tests listed in batches | Modified | Concrete `capsule_inputs` on v2 WorkOrders; E2E plural query + Option A |

## Deviations from Design

None blocking. Cosmetic: `defaultPathInventory` is a compiler helper so glob-only replay graphs can resolve capsules without a live snapshot file map. The JSON Schema interpreter gained `minItems`/`uniqueItems` so the v2 contract is actually enforced.

## Issues Found

None blocking. Legacy CandidateId-keyed stores remain fail-closed with no implicit migration (clean store required).

## Remaining Tasks

None.

## Workload / PR Boundary

- Mode: `size:exception`
- Current work unit: all four logical batches in one apply
- Boundary: schema through E2E
- Estimated review budget impact: High (forecast ~950–1200 lines; exception approved)
