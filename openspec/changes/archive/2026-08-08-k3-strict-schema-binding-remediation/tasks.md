# Tasks: K3 Strict Schema & Binding Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-identities-007 / `computeSourceSnapshotId` strict shape | MUST | `scripts/lib/execution-identities/index.js` `computeSourceSnapshotId` | covered-by-design | Require `repository_id` minLength 1, validate `projection` enum |
| REQ-execution-identities-007 / `computeWorkOrderId` strict shape | MUST | `scripts/lib/execution-identities/index.js` `computeWorkOrderId` | covered-by-design | Reject missing required fields without defaulting to `""`, `[]`, `{}` |
| REQ-execution-identities-007 / `computeWorkResultId` strict arrays | MUST | `scripts/lib/execution-identities/index.js` `computeWorkResultId` | covered-by-design | Require `commands`, `logs`, `filesystem_inventory` arrays without `[]` default |
| REQ-execution-identities-003 / Cumulative schema & digest binding gates | MUST | `scripts/lib/execution-identities/index.js` `validateWorkOrderBinding` & `validateWorkResultBinding` | covered-by-design | Validate schema compliance before/during digest recompute |
| REQ-execution-identities-008 & REQ-kernel-contract-schemas-012 / V1 kind & schema coherence | MUST | `schemas/kernel/source-snapshot/v1.schema.json`, `work-result/v1.schema.json`, `index.js` | covered-by-design | Allow optional `kind` in v1 schemas, align `validateIdentityKind` |
| REQ-kernel-contract-schemas-012 / K1 baseline refinement | MUST | `scripts/lib/lifecycle-kernel/k1-compat.js`, `k1-schema-compat.js` | covered-by-design | Exclude evolutionary registry manifests from `K1_SCHEMA_BASELINE` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–250 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR under `exception-ok` |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Strict shape compute*, binding schema gates, v1 schemas & K1 baseline | Single PR | All files & adversarial tests in single batch |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schemas & K1 Baseline Refinement

- [x] 1.1 Update `schemas/kernel/source-snapshot/v1.schema.json` and `schemas/kernel/work-result/v1.schema.json` to allow optional `kind` property matching `"source-snapshot/v1"` and `"work-result/v1"` [REQ-kernel-contract-schemas-012, REQ-execution-identities-008]
- [x] 1.2 Refine `K1_SCHEMA_BASELINE` in `scripts/lib/lifecycle-kernel/k1-compat.js` to exclude `manifest.json` and `contract-claims.json` [REQ-kernel-contract-schemas-012]
- [x] 1.3 Update `scripts/lib/contract-checkers/k1-schema-compat.js` to align baseline check with refined inventory [REQ-kernel-contract-schemas-012]

## Phase 2: Strict Shape Compute Functions

- [x] 2.1 Enforce strict `repository_id` (non-empty) and `projection` (`"workspace"` | `"staged"` | `"commit"`) in `computeSourceSnapshotId` in `scripts/lib/execution-identities/index.js` [REQ-execution-identities-007]
- [x] 2.2 Enforce strict required fields in `computeWorkOrderId` (`operation`, `objective`, `dependencies`, `ownership`, `allowed_paths`, `invariants`, `required_evidence`, `budget`), rejecting missing values without defaults [REQ-execution-identities-007]
- [x] 2.3 Enforce strict required array fields in `computeWorkResultId` (`commands`, `logs`, `filesystem_inventory`), rejecting missing values without `[]` defaulting [REQ-execution-identities-007]
- [x] 2.4 Align `validateIdentityKind` for `SourceSnapshot` v1 and `WorkResult` v1 to pass schema-valid v1 objects with or without `kind` [REQ-execution-identities-008]

## Phase 3: Cumulative Binding Gates

- [x] 3.1 Integrate schema validation for `sourceSnapshot` and `workOrder` in `validateWorkOrderBinding` in `scripts/lib/execution-identities/index.js` [REQ-execution-identities-003]
- [x] 3.2 Integrate schema validation for `workOrder` and `workResult` in `validateWorkResultBinding` in `scripts/lib/execution-identities/index.js` [REQ-execution-identities-003]

## Phase 4: Adversarial TDD & Verification

- [x] 4.1 Write adversarial unit tests in `scripts/lib/execution-identities/index.test.js` covering: missing `repository_id`, invalid `projection`, missing WorkOrder fields (`dependencies`, `budget`, etc.), missing WorkResult arrays (`commands`, `logs`, `inventory`), schema-invalid payloads with self-consistent digests passing/failing bindings, and v1 kind validation [REQ-execution-identities-003, REQ-execution-identities-007, REQ-execution-identities-008]
- [x] 4.2 Run `node scripts/check.js` to ensure full test suite passes with 0 errors and 0 warnings [REQ-execution-identities-003, REQ-kernel-contract-schemas-012]
