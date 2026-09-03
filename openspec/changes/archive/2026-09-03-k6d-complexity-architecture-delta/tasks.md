# Tasks: K6d Complexity and Architecture Delta

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-complexity-architecture-delta-001 / equivalent inputs | MUST | `integrity.js`, `index.test.js` | covered-by-design | Normalize, hash and serialize canonically. |
| REQ-complexity-architecture-delta-001 / binding failure | MUST | `integrity.js`, report validator | covered-by-design | Candidate schema and identity are checked fail-closed. |
| REQ-complexity-architecture-delta-002 / nine dimensions | MUST | `analyzer.js`, delta schema | covered-by-design | Closed dimension map covers all required inventories. |
| REQ-complexity-architecture-delta-002 / unavailable observation | MUST | `integrity.js`, fixtures | covered-by-design | Unavailable retains reason and never becomes zero. |
| REQ-complexity-architecture-delta-003 / complete rationale | MUST | alternative schema, integrity | covered-by-design | Conditional required fields for `new-abstraction`. |
| REQ-complexity-architecture-delta-003 / missing rationale | MUST | negative fixtures | covered-by-design | Validator identifies missing simpler/retirement fields. |
| REQ-complexity-architecture-delta-004 / advisory signal | MUST | `advisory.js`, authority guard | covered-by-design | No verdict, lifecycle or delivery mutation vocabulary. |
| REQ-complexity-architecture-delta-004 / no CX0 | MUST | input allowlist, integration test | covered-by-design | Telemetry is neither accepted nor required. |
| REQ-harness-authority-canon-013 / maturity boundary | MUST | `harness-evolution.md`, boundary test | covered-by-design | K6d implemented advisory; K7-K9 remain targets. |
| REQ-harness-authority-canon-013 / misuse rejection | MUST | `rejectAuthorityMisuse`, boundary test | covered-by-design | Structured `K6D_AUTHORITY_MISUSE` failure. |
| REQ-kernel-contract-schemas-030 / publication | MUST | schemas, manifest, claims | covered-by-design | Both v1 families registered and closed. |
| REQ-kernel-contract-schemas-030 / valid-invalid fixtures | MUST | fixture tree, schema test | covered-by-design | Binding, identity, classification and rationale cases included. |
| REQ-kernel-contract-schemas-030 / cross-family rejection | MUST | schema test, identity guards | covered-by-design | K6d payloads cannot validate as other families. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 650–850 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR under accepted `size:exception`, with four autonomous work units |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Publish both closed v1 schemas, fixtures, manifest and claims | PR 1 | Include schema RED tests before implementation. |
| 2 | Implement normalization, identity, validation and nine-dimension analyzer | PR 1 | Depends on contract shapes; focused TDD RED→GREEN→REFACTOR. |
| 3 | Add advisory generation, public API and authority boundary | PR 1 | Must remain independent of CX0 and lifecycle stores. |
| 4 | Integrate regression, boundary tests and documentation | PR 1 | Verify K1/K6b/K6c pins and roadmap maturity. |

## Phase 1: Contract Foundation

- [x] 1.1 RED: add schema/fixture tests for valid and invalid alternative/report payloads [REQ-kernel-contract-schemas-030]
- [x] 1.2 Create closed `architecture-alternative/v1.schema.json` with conditional `new-abstraction` rationale and canonical IDs [REQ-complexity-architecture-delta-003, REQ-kernel-contract-schemas-030]
- [x] 1.3 Create closed `complexity-architecture-delta/v1.schema.json` covering nine dimensions, advisory signals and Candidate binding [REQ-complexity-architecture-delta-001, REQ-complexity-architecture-delta-002, REQ-complexity-architecture-delta-004]
- [x] 1.4 Add valid, malformed identity/binding, unavailable, unsupported-classification, incomplete-rationale and cross-family fixtures; register schemas in manifest and claims [REQ-kernel-contract-schemas-030]

## Phase 2: Core Deterministic Engine

- [x] 2.1 RED: test reordered-equivalent inputs, duplicate IDs, malformed digests, missing dimensions and divergent Candidate identities [REQ-complexity-architecture-delta-001]
- [x] 2.2 Implement `integrity.js` normalization, Candidate validation, canonical input hashing, report/alternative identity recomputation, stable UTF-8 bytes and structured failures [REQ-complexity-architecture-delta-001, REQ-kernel-contract-schemas-030]
- [x] 2.3 RED: test added/removed/changed records across all nine dimensions and unavailable observations [REQ-complexity-architecture-delta-002]
- [x] 2.4 Implement `analyzer.js` deterministic set deltas with sorted outputs and explicit unavailable branches [REQ-complexity-architecture-delta-002]
- [x] 2.5 GREEN/REFACTOR: make canonicalization and analyzer tests pass without importing collectors, CX0 or authority modules [REQ-complexity-architecture-delta-001, REQ-complexity-architecture-delta-004]

## Phase 3: Advisory API and Boundaries

- [x] 3.1 RED: test complete/incomplete alternatives, overengineering questions, absence of decision fields and no-CX0 report creation [REQ-complexity-architecture-delta-003, REQ-complexity-architecture-delta-004]
- [x] 3.2 Implement pure `advisory.js` signal mapping and `index.js` create/validate API with `rejectAuthorityMisuse` [REQ-complexity-architecture-delta-004, REQ-harness-authority-canon-013]
- [x] 3.3 Modify `lifecycle-kernel/k1-compat.js` to exclude only additive K6d paths while preserving frozen pins [REQ-harness-authority-canon-013]

## Phase 4: Verification and Documentation

- [x] 4.1 Add integration and regression assertions for Candidate v2 binding, cross-family rejection, K1/K6b/K6c compatibility and K6d import boundaries [REQ-complexity-architecture-delta-001, REQ-kernel-contract-schemas-030, REQ-harness-authority-canon-013]
- [x] 4.2 Update `docs/architecture/harness-evolution.md` to label K6d implemented advisory evidence and retain K7-K9 as target work [REQ-harness-authority-canon-013]
- [x] 4.3 Run focused Node tests and schema fixture suite; record failures and final verification evidence for `sdd-verify` [REQ-complexity-architecture-delta-001, REQ-complexity-architecture-delta-002, REQ-complexity-architecture-delta-003, REQ-complexity-architecture-delta-004]

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally
