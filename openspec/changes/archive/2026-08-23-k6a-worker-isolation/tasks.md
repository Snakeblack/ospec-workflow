# Tasks: K6a — Worker Isolation and Work-Order Capsule

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-worker-isolation-001` (Workspace Lifecycle Primitives) | MUST | `scripts/lib/worker-workspace.js`: `createWorkspace`, `disposeWorkspace` | covered-by-design | Directory allocation, UUID generation, status tracking, idempotent cleanup |
| `REQ-worker-isolation-002` (Minimal Work-Order Capsule Materialization) | MUST | `scripts/lib/worker-workspace.js`: `materializeSourceSnapshot` | covered-by-design | Minimal projection of declared dependencies, deterministic SHA-256 fingerprinting |
| `REQ-worker-isolation-003` (Strict Filesystem Containment And Path Validation) | MUST | `scripts/lib/allowed-paths-validator.js`: `validateAllowedPaths`, `isPathContained` | covered-by-design | Fail-closed validation against `../` traversal, symlink escapes, undeclared writes |
| `REQ-worker-isolation-004` (Worker Execution Engine And Host Transport Integration) | MUST | `scripts/lib/worker-executor.js`: `executeWorkOrder` | covered-by-design | Consumes K2a `WorkerTransport` port, captures exit codes, streams, execution timing |
| `REQ-worker-isolation-005` (Raw Work Result Capture And Cryptographic Binding) | MUST | `scripts/lib/worker-executor.js`: `captureWorkResult` | covered-by-design | Packages diff patch, logs, filesystem inventory; binds `work_result_id` cryptographically |
| `REQ-worker-isolation-006` (Interrupted Execution Preservation And Recovery) | MUST | `scripts/lib/worker-executor.js`: `recoverInterruptedExecution` | covered-by-design | Preserves partial telemetry/diffs on timeout/abort; marks workspace status `interrupted` |
| `REQ-worker-isolation-007` (Strict Identity Boundary And CandidateId Prohibition) | MUST | `scripts/lib/contract-checkers/k6a-candidate-prohibition.js`, schemas | covered-by-design | Strictly prohibits CandidateId emission/assumption; removes Repair terms from public API |
| `REQ-worker-isolation-008` (Host Isolation Capability Fallback) | MUST | `scripts/lib/worker-executor.js`: `executeWorkOrder` fallback handling | covered-by-design | Handles `enforced`, `partial`, `instructional`, `unavailable` without silent promotion |
| `REQ-kernel-contract-schemas-021` (Workspace Descriptor And Capsule Definition Schemas) | MUST | `schemas/kernel/workspace-descriptor/`, `schemas/kernel/capsule-definition/` | covered-by-design | JSON schemas and valid/invalid fixtures with explicit `schema_version: 1` |
| `REQ-kernel-contract-schemas-022` (Work Result Payload And Containment Violation Schemas) | MUST | `schemas/kernel/work-result-execution-payload/`, `schemas/kernel/containment-violation/` | covered-by-design | JSON schemas, negative non-aliasing fixtures against Candidate schemas |
| `REQ-kernel-contract-schemas-001` (Versioned Schema Families Registration) | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Registers 4 new schema families with stable `$id` and explicit versioning |
| `REQ-contract-lint-016` (CandidateId Non-Emission Checker) | MUST | `scripts/lib/contract-checkers/k6a-candidate-prohibition.js` | covered-by-design | Validates zero CandidateId fields in K6a primitives, schemas, and fixtures |
| `REQ-contract-lint-017` (Capsule Path Containment Checker) | MUST | `scripts/lib/contract-checkers/k6a-capsule-path-containment.js` | covered-by-design | Verifies non-empty allowed_paths and rejects relative traversal sequences |
| `REQ-lifecycle-model-conformance-012` (Executable K6a Invariants) | MUST | `scripts/lib/lifecycle-model.js`: `K6A_EXECUTABLE_INVARIANTS` (6 invariants) | covered-by-design | Concrete executable checkers for lifecycle, determinism, containment, binding, recovery, fallback |
| `REQ-lifecycle-model-conformance-003` (Opaque Future Ports Update) | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Promotes worker execution structures to concrete while keeping Candidate/Delivery opaque |
| `REQ-lifecycle-model-conformance-004` (Deferred Invariants Cleanup) | MUST | `scripts/lib/lifecycle-model.js`: `DEFERRED_INVARIANTS` | covered-by-design | Removes K6a invariants from deferred list to ensure enforceable model checks |

### Reconciliation Verdict
- MUST coverage: complete (16 / 16 requirements fully mapped to design components)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 950 - 1300 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Schemas) → PR 2 (Containment & Workspace) → PR 3 (Executor) → PR 4 (Lint & Conformance) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schemas & validation fixtures | PR 1 | Base kernel contracts in `schemas/kernel/` |
| 2 | Path containment validation | PR 2 | `allowed-paths-validator.js` with fail-closed security checks |
| 3 | Workspace lifecycle & capsule materialization | PR 3 | `worker-workspace.js` with fingerprinting and idempotency |
| 4 | Worker execution runtime & transport integration | PR 4 | `worker-executor.js` with WorkResult capture & recovery |
| 5 | Contract lint checkers & registry | PR 5 | Prohibits CandidateId and checks allowed_paths |
| 6 | Lifecycle model conformance invariants | PR 6 | 6 executable invariants in `lifecycle-model.js` |
| 7 | Full test suite verification & regression | PR 7 | End-to-end test suite pass across all layers |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Schemas and Contract Fixtures (Kernel Contracts)

- [x] 1.1 [RED] Write failing schema validation tests for K6a schema families in `scripts/lib/k6a-schema-fixtures.test.js` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-021, REQ-kernel-contract-schemas-022]
- [x] 1.2 [GREEN] Create JSON schema `schemas/kernel/workspace-descriptor/v1.schema.json` and valid/invalid fixtures [REQ-kernel-contract-schemas-021]
- [x] 1.3 [GREEN] Create JSON schema `schemas/kernel/capsule-definition/v1.schema.json` and valid/invalid fixtures [REQ-kernel-contract-schemas-021]
- [x] 1.4 [GREEN] Create JSON schema `schemas/kernel/work-result-execution-payload/v1.schema.json` and valid/invalid/negative non-aliasing fixtures [REQ-kernel-contract-schemas-022, REQ-worker-isolation-007]
- [x] 1.5 [GREEN] Create JSON schema `schemas/kernel/containment-violation/v1.schema.json` and valid/invalid/negative non-aliasing fixtures [REQ-kernel-contract-schemas-022]
- [x] 1.6 [GREEN] Update `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json` to register the 4 new schema families [REQ-kernel-contract-schemas-001]
- [x] 1.7 [REFACTOR] Verify and clean up schema definitions and ensure all schema fixture tests in `scripts/lib/k6a-schema-fixtures.test.js` pass [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-021, REQ-kernel-contract-schemas-022]

## Phase 2: Filesystem Containment and Allowed Paths Validator

- [x] 2.1 [RED] Write failing unit and boundary tests for path containment validation in `scripts/lib/allowed-paths-validator.test.js` [REQ-worker-isolation-003]
- [x] 2.2 [GREEN] Implement `isPathContained` and canonical path resolution in `scripts/lib/allowed-paths-validator.js` [REQ-worker-isolation-003]
- [x] 2.3 [GREEN] Implement `ValidateAllowedPaths` with fail-closed checks against `../` traversal, external symlinks, and undeclared writes, emitting `containment-violation/v1` descriptors [REQ-worker-isolation-003]
- [x] 2.4 [REFACTOR] Clean up path containment logic, enforce cross-platform path normalization, and verify `scripts/lib/allowed-paths-validator.test.js` passes [REQ-worker-isolation-003]

## Phase 3: Workspace Lifecycle and Capsule Materialization

- [x] 3.1 [RED] Write failing unit and integration tests for workspace lifecycle and capsule materialization in `scripts/lib/worker-workspace.test.js` [REQ-worker-isolation-001, REQ-worker-isolation-002]
- [x] 3.2 [GREEN] Implement `CreateWorkspace` and `DisposeWorkspace` with directory provisioning, status tracking, and idempotent cleanup in `scripts/lib/worker-workspace.js` [REQ-worker-isolation-001]
- [x] 3.3 [GREEN] Implement `MaterializeSourceSnapshot` with minimal dependency projection, excluding repository artifacts and git metadata, computing deterministic SHA-256 capsule fingerprints in `scripts/lib/worker-workspace.js` [REQ-worker-isolation-002]
- [x] 3.4 [GREEN] Implement `InspectWorkspace` for filesystem inventory calculation (paths, SHA-256 digests, file modes) in `scripts/lib/worker-workspace.js` [REQ-worker-isolation-001, REQ-worker-isolation-005]
- [x] 3.5 [REFACTOR] Verify idempotency and deterministic fingerprinting across runs in `scripts/lib/worker-workspace.test.js` [REQ-worker-isolation-001, REQ-worker-isolation-002]

## Phase 4: Worker Execution Runtime and Transport Integration

- [x] 4.1 [RED] Write failing unit and integration tests for worker execution, WorkResult capture, timeout/abort recovery, and host transport integration in `scripts/lib/worker-executor.test.js` [REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008]
- [x] 4.2 [GREEN] Implement `ExecuteWorkOrder` consuming `WorkerTransport` from host adapter, executing commands within workspace, capturing exit code, logs, and timing [REQ-worker-isolation-004, REQ-worker-isolation-008]
- [x] 4.3 [GREEN] Implement host isolation capability fallback in `scripts/lib/worker-executor.js` handling `enforced`, `partial`, `instructional`, and `unavailable` without silent promotion [REQ-worker-isolation-008]
- [x] 4.4 [GREEN] Implement `CaptureWorkResult` assembling diff patch, command logs, exit code, and filesystem inventory, computing cryptographic `work_result_id` bound to `work_order_id` and `source_snapshot_id` with zero CandidateId properties [REQ-worker-isolation-005, REQ-worker-isolation-007]
- [x] 4.5 [GREEN] Implement `RecoverInterruptedExecution` in `scripts/lib/worker-executor.js` capturing partial stderr/stdout streams, modified file inventory, and setting workspace status to `interrupted` upon timeouts or abort signals [REQ-worker-isolation-006]
- [x] 4.6 [REFACTOR] Refactor execution runtime error handling and verify all tests in `scripts/lib/worker-executor.test.js` pass [REQ-worker-isolation-004, REQ-worker-isolation-005, REQ-worker-isolation-006, REQ-worker-isolation-008]

## Phase 5: Contract-Lint Checkers and Aggregator Integration

- [x] 5.1 [RED] Write failing tests for K6a contract-lint checkers in `scripts/lib/contract-checkers/k6a-checkers.test.js` [REQ-contract-lint-016, REQ-contract-lint-017]
- [x] 5.2 [GREEN] Implement CandidateId prohibition checker in `scripts/lib/contract-checkers/k6a-candidate-prohibition.js` [REQ-contract-lint-016, REQ-worker-isolation-007]
- [x] 5.3 [GREEN] Implement capsule allowed_paths and path containment checker in `scripts/lib/contract-checkers/k6a-capsule-path-containment.js` [REQ-contract-lint-017]
- [x] 5.4 [GREEN] Register both K6a checkers in `DEFAULT_REGISTRY` in `scripts/lib/contract-lint.js` [REQ-contract-lint-016, REQ-contract-lint-017]
- [x] 5.5 [REFACTOR] Verify contract-lint tests pass without false positives in `scripts/lib/contract-checkers/k6a-checkers.test.js` and `scripts/lib/contract-lint.test.js` [REQ-contract-lint-016, REQ-contract-lint-017]

## Phase 6: Lifecycle Model Conformance Invariants

- [x] 6.1 [RED] Write failing model tests for the 6 K6a executable invariants in `scripts/lib/k6a-lifecycle-model.test.js` [REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-012]
- [x] 6.2 [GREEN] Promote K6a invariants from `DEFERRED_INVARIANTS` to `K6A_EXECUTABLE_INVARIANTS` and update opaque ports description in `scripts/lib/lifecycle-model.js` [REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004]
- [x] 6.3 [GREEN] Implement invariant checkers for `inv-k6a-workspace-lifecycle`, `inv-k6a-capsule-determinism`, and `inv-k6a-containment-fail-closed` in `scripts/lib/lifecycle-model.js` [REQ-lifecycle-model-conformance-012]
- [x] 6.4 [GREEN] Implement invariant checkers for `inv-k6a-work-result-binding`, `inv-k6a-interrupted-recovery-preservation`, and `inv-k6a-host-isolation-fallback` in `scripts/lib/lifecycle-model.js` [REQ-lifecycle-model-conformance-012, REQ-worker-isolation-007]
- [x] 6.5 [REFACTOR] Verify all 6 K6a lifecycle model invariant checks and overall invariant suite pass in `scripts/lib/k6a-lifecycle-model.test.js` and `scripts/lib/lifecycle-model.test.js` [REQ-lifecycle-model-conformance-012]

## Phase 7: Comprehensive Verification and Regression Suite

- [x] 7.1 Run full kernel schema validation suite across all schemas and fixtures [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-021, REQ-kernel-contract-schemas-022]
- [x] 7.2 Run contract-lint across entire repository to verify zero offenders and confirm K3 identity boundary integrity [REQ-contract-lint-016, REQ-contract-lint-017, REQ-worker-isolation-007]
- [x] 7.3 Run full lifecycle model conformance suite verifying all invariants pass [REQ-lifecycle-model-conformance-012]
- [x] 7.4 Execute complete test suite (`npm test`) ensuring zero regressions across all 20+ test suites [REQ-worker-isolation-001, REQ-worker-isolation-004, REQ-worker-isolation-005]
