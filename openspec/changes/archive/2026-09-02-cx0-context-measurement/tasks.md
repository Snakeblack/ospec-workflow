# Tasks: CX0 Context Measurement

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-context-measurement-001 / fully observed dispatch | MUST | `schemas/telemetry/context-measurement/v1.schema.json`, `scripts/lib/context-measurement.js` | covered-by-design | Closed metric unions, bounded identifiers and provenance/coverage. |
| REQ-context-measurement-002 / covered and incomplete KPIs | MUST | `scripts/lib/context-measurement.js` | covered-by-design | Compatible covered components only; versioned amplification and reason codes. |
| REQ-context-measurement-003 / equivalent percentiles and unavailable cohort | MUST | `scripts/lib/context-measurement.js`, `scripts/evals/lib/benchmark.js` | covered-by-design | Canonical cohort ordering and nearest-rank P50/P90. |
| REQ-context-measurement-004 / contradicted hypothesis | MUST | `hypotheses.v1.json`, context library and benchmark report API | covered-by-design | Advisory result is disconnected from scoring and policy. |
| REQ-context-measurement-005 / legacy compatibility | MUST | `scripts/lib/ospec-state.js`, existing O1 readers | covered-by-design | Separate append-only stream preserves O1 bytes and semantics. |
| REQ-hooks-017 / success, degradation, write failure | MUST | `scripts/hooks/subagent-stop.js` | covered-by-design | Post-O1 independent fail-safe boundary preserves stdout and continuation. |
| REQ-orchestrator-evals-007 / mixed coverage, invalid rows, advisory isolation | MUST | benchmark CX0 APIs and tests | covered-by-design | Validation precedes aggregation; unavailable never becomes zero. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none; amplification clarification is incorporated in the spec and design.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 650–850 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Contract/library → persistence and hook → evaluation/reporting and regression suite |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Implement v1 schema, hypotheses registry, fixtures, pure normalization/KPI/validation | PR 1 | RED→GREEN→REFACTOR; self-contained contract library. |
| 2 | Add locked CX0 JSONL persistence and SubagentStop collection/emission | PR 1 | Depends on Unit 1; verify O1 ordering, stdout and failure isolation. |
| 3 | Add deterministic cohort aggregation, benchmark report/comparison APIs and integration tests | PR 1 | Depends on Units 1–2; verify advisory isolation and reproducibility. |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Contract and Pure Measurement Core

- [x] 1.1 Create `schemas/telemetry/context-measurement/v1.schema.json` with closed record/dimension/metric unions, bounds, sources, coverage, candidate binding and fallback codes [REQ-context-measurement-001]
- [x] 1.2 Create `schemas/telemetry/context-measurement/hypotheses.v1.json` with stable IDs, selectors, operators, targets and formula versions for every CX0 hypothesis [REQ-context-measurement-004]
- [x] 1.3 Add valid/invalid fixtures covering full, degraded, unknown-source, missing-reason, partial-KPI and payload-rejection records [REQ-context-measurement-001, REQ-context-measurement-003, REQ-orchestrator-evals-007]
- [x] 1.4 RED: add `scripts/lib/context-measurement.test.js` cases for schema semantics, bounds, privacy and amplification unavailable reasons [REQ-context-measurement-001, REQ-context-measurement-002]
- [x] 1.5 GREEN: implement `normalizeContextMeasurement`, `validateContextMeasurement` and `deriveContextKpis` in `scripts/lib/context-measurement.js` [REQ-context-measurement-001, REQ-context-measurement-002]
- [x] 1.6 REFACTOR: expose canonical serialization and preserve raw component provenance without payloads; keep formula versions explicit [REQ-context-measurement-002, REQ-context-measurement-005]

## Phase 2: Durable Emission and Hook Integration

- [x] 2.1 RED: extend `scripts/lib/ospec-state.test.js` for locked concurrent append, final newline, immutability and write failure of the CX0 stream [REQ-context-measurement-005]
- [x] 2.2 GREEN: add `appendContextMeasurement({workspace, changeName, record})` to `scripts/lib/ospec-state.js` using `.ospec/session/{change}/context-measurements.jsonl`, leaving `appendPhaseCost` unchanged [REQ-context-measurement-005]
- [x] 2.3 RED: add `scripts/hooks/subagent-stop.test.js` cases for post-O1 ordering, host degradation, write failure, unchanged stdout and `continue: true` [REQ-hooks-017]
- [x] 2.4 GREEN: collect bounded host/runtime observations and invoke normalization plus CX0 append after legacy processing inside an independent fail-safe boundary in `scripts/hooks/subagent-stop.js` [REQ-hooks-017, REQ-context-measurement-001]
- [x] 2.5 REFACTOR: verify legacy envelope/phase-cost outcomes, authority, routing and dispatch paths have no CX0 dependency [REQ-hooks-017, REQ-context-measurement-005]

## Phase 3: Evaluation and Advisory Reporting

- [x] 3.1 RED: add pure tests for deterministic cohort keys, nearest-rank P50/P90, mixed coverage, unavailable-only metrics and canonical byte-equivalence [REQ-context-measurement-003, REQ-orchestrator-evals-007]
- [x] 3.2 GREEN: implement `aggregateContextMeasurements`, canonical sorting and `loadCx0Hypotheses`/`compareCx0Hypotheses` in `scripts/lib/context-measurement.js` [REQ-context-measurement-003, REQ-context-measurement-004]
- [x] 3.3 Add `readContextMeasurements` and `buildCx0Report` to `scripts/evals/lib/benchmark.js`, keeping benchmark scoring exports and policy callers unchanged [REQ-orchestrator-evals-007, REQ-context-measurement-004]
- [x] 3.4 RED/GREEN: extend `scripts/evals/lib/benchmark.test.js` for invalid-row rejection, source composition, coverage counts, hypothesis outcomes and advisory non-interference [REQ-orchestrator-evals-007, REQ-context-measurement-004]

## Phase 4: Focused Verification and Regression

- [x] 4.1 Run focused Node native tests for context measurement, state, hook and benchmark suites; resolve failures without changing contract semantics [REQ-context-measurement-001, REQ-hooks-017, REQ-orchestrator-evals-007]
- [x] 4.2 Run `npm test` and assert O1 parsing/attestation, stdout continuation, route/authority state and K6d paths remain unchanged [REQ-context-measurement-005]
- [x] 4.3 Confirm report output documents coverage, formula versions and advisory status, with no gate, budget, default, routing, authority or release-policy integration [REQ-context-measurement-004, REQ-context-measurement-005]
