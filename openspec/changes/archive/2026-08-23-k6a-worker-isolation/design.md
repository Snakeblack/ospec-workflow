# Design: K6a — Worker Isolation and Work-Order Capsule

## Technical Approach

K6a establishes the execution runtime primitives (`CreateWorkspace`, `MaterializeSourceSnapshot`, `ExecuteWorkOrder`, `CaptureWorkResult`, `ValidateAllowedPaths`, `RecoverInterruptedExecution`, `DisposeWorkspace`) for executing tasks in an isolated workspace/capsule bounded strictly by `allowed_paths`.

This design implements the requirements defined in `openspec/changes/k6a-worker-isolation/specs/` and aligns with Block 6a of the Harness Evolution Roadmap (`docs/roadmaps/harness-evolution.md`):
1. **Workspace Lifecycle & Capsule Materialization (`scripts/lib/worker-workspace.js`)**: Manages dedicated execution directories, computes deterministic SHA-256 fingerprints over graph-declared dependencies, and projects minimal capsules while excluding extraneous repository files.
2. **Fail-Closed Containment Validator (`scripts/lib/allowed-paths-validator.js`)**: Enforces sandbox boundaries during pre-flight and post-flight phases, detecting relative path traversal (`../`), external symlink escapes, or undeclared writes, and emitting structured `containment-violation/v1` descriptors.
3. **Worker Execution Engine (`scripts/lib/worker-executor.js`)**: Consumes the `WorkerTransport` port from the reference host adapter (`claude`) / Headless Conformance Host (from K2a), enforces execution budgets, handles host capability fallbacks explicitly without silent promotion, captures raw unapproved execution outputs (`WorkResult`), and preserves interrupted execution state (`interrupted_execution.json`).
4. **Identity & Domain Boundaries (`scripts/lib/execution-identities/`, `schemas/kernel/`)**: Enforces the K3 identity boundary by producing `WorkResult` and `WorkResultId` cryptographically bound to `WorkOrderId` / `SourceSnapshotId`, strictly prohibiting any emission or assumption of `CandidateId`, and keeping K6a public APIs free of Repair domain concepts.
5. **Contract Schemas, Lint Checkers & Lifecycle Invariants**: Registers schema families for workspace descriptors, capsule definitions, work results, and containment violations, implements contract-lint checkers for CandidateId non-emission and capsule path containment, and promotes 6 executable invariants in `scripts/lib/lifecycle-model.js`.

---

## Architecture Decisions

### Decision: Strict K3 Identity Boundary (WorkResult emission only)

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. K6a emits CandidateId directly** | Simplifies pipeline by combining execution and candidate freezing; **violates K3 identity boundary and couples worker to candidate semantics** | Rejected |
| **2. K6a emits raw WorkResult bound to WorkOrderId/SourceSnapshotId** | Strict separation of raw unapproved execution output from candidate creation; CandidateId is created only after integration/freeze (owned by K4b via K3) | **Chosen** |

**Choice**: K6a primitives emit and accept only `WorkResult` identified by `WorkResultId`. `CandidateId` is strictly forbidden in K6a schemas, outputs, and fixtures.
**Alternatives considered**: Allowing workers to mint `CandidateId` directly was rejected because candidate generation requires validation, integration, and policy checks that belong downstream in K4b/K3.
**Rationale**: Adheres to the harness roadmap identity boundary: workers produce raw evidence (`WorkResult`); K4b orchestrates and integrates; K3 identifies candidates.

---

### Decision: Dual-Phase Fail-Closed Filesystem Containment (`ValidateAllowedPaths`)

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. OS-level process isolation only** | Relies entirely on underlying container/chroot capabilities; fails if host adapter is `partial` or `unavailable` | Rejected |
| **2. Dual-phase pre-flight and post-flight software validation** | Works uniformly across host isolation capabilities (`enforced`, `partial`, `unavailable`), validating path traversal and symlinks fail-closed | **Chosen** |

**Choice**: Implement `ValidateAllowedPaths` to perform canonical path resolution, symlink target resolution, and path prefix containment verification during pre-flight (declaring targets) and post-flight (analyzing modified workspace files).
**Alternatives considered**: Relying solely on host OS sandbox was rejected because host adapters may run in environments where host isolation is `partial` or `unavailable`.
**Rationale**: Guarantees zero writes outside `allowed_paths` regardless of the host environment, emitting structured `containment-violation/v1` descriptors upon any violation.

---

### Decision: Host Isolation Consumption with Explicit Degradation Fallback

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. Silent promotion to enforced** | Conceals missing host sandbox capability; presents false security guarantees | Rejected |
| **2. Explicit capability tracking with documented fallback** | When host isolation is `partial` or `unavailable`, execution uses software boundary enforcement and logs capability state truthfully | **Chosen** |

**Choice**: Consume `WorkerTransport` from K2a `HostAdapter`. When capability is `enforced`, utilize host sandbox; when `partial` or `instructional`, enforce software boundaries and log state; when `unavailable`, execute documented fallback path without asserting `enforced`.
**Alternatives considered**: Refusing to execute whenever host sandbox is not `enforced` was rejected because headless and local CI environments require software-fallback execution.
**Rationale**: Enforces truth-in-reporting and prevents deceptive security states while preserving portability across environments.

---

### Decision: Deterministic Capsule Construction & Interruption Preservation

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. Copy entire repository to workspace** | Simple; copies git metadata and non-dependency files, breaking determinism and leaking state | Rejected |
| **2. Minimal projection of declared dependencies with deterministic fingerprinting** | Projects only files declared in graph dependencies/snapshot; computes SHA-256 fingerprint over sorted relative paths and file digests | **Chosen** |

**Choice**: `MaterializeSourceSnapshot` projects exclusively declared dependency files, excluding extraneous repo artifacts and git history. On interruption (timeout/abort), `RecoverInterruptedExecution` captures partial logs and modified file inventory into an executable recovery state.
**Alternatives considered**: Full repo clones or unstructured process termination were rejected because they leak untracked state and lose diagnostic evidence upon timeouts.
**Rationale**: Enables reproducible capsule execution and reliable diagnostic recovery without data loss.

---

### Decision: Decoupling K6a Primitives from Repair and Graph Compilation

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| **1. Embed Repair shadow logic in worker executor** | Combines execution and shadow orchestration; violates single responsibility principle | Rejected |
| **2. Generic execution primitives consumed by downstream orchestrators** | K6a knows only WorkOrder, SourceSnapshot, and WorkResult; K4b orchestrates Repair shadow | **Chosen** |

**Choice**: K6a public APIs and schemas contain zero references to `freezeCandidate`, `RepairShadow`, `CandidateEvaluationAttestation`, or graph compilation logic.
**Alternatives considered**: Combining K6a and K4b into a single change was rejected by the roadmap architecture to keep execution primitives reusable and modular.
**Rationale**: Guarantees a one-way dependency (`K4b -> K6a`), allowing any future execution orchestrator to reuse isolation primitives.

---

## Data Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Caller / Orchestrator (e.g. K4b or Minimal Kernel Harness)  │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
               1. CreateWorkspace(source_snapshot_id)
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/worker-workspace.js                  │
         │ - Provisions isolated directory (ws-<id>)         │
         │ - Returns workspace-descriptor/v1 (active)       │
         └────────────────────────┬─────────────────────────┘
                                  │
                                  ▼
         2. MaterializeSourceSnapshot(workspace, workOrder, snapshot)
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/worker-workspace.js                  │
         │ - Projects declared dependencies only            │
         │ - Computes deterministic SHA-256 fingerprint     │
         │ - Returns capsule-definition/v1                  │
         └────────────────────────┬─────────────────────────┘
                                  │
                                  ▼
         3. ExecuteWorkOrder({ workOrder, workspace, transport, budget })
                                  │
                                  ▼
         ┌──────────────────────────────────────────────────┐
         │ scripts/lib/allowed-paths-validator.js           │
         │ - Pre-flight check: allowed_paths containment    │
         └────────────────────────┬─────────────────────────┘
                                  │
                     ┌────────────┴────────────┐
             [Valid] │                         │ [Violation]
                     ▼                         ▼
         ┌─────────────────────────┐     ┌──────────────────────────────────┐
         │ scripts/lib/            │     │ Emit containment-violation/v1    │
         │   worker-executor.js    │     │ Halt fail-closed                 │
         │ - Consumes K2a          │     └──────────────────────────────────┘
         │   WorkerTransport       │
         │ - Executes command      │
         └───────────┬─────────────┘
                     │
         ┌───────────┴───────────────────────┐
 [Normal │ Exit]                             │ [Timeout / Abort Signal]
         ▼                                   ▼
 4. CaptureWorkResult(...)           5. RecoverInterruptedExecution(...)
         │                                   │
         ▼                                   ▼
 ┌──────────────────────────────┐    ┌──────────────────────────────────┐
 │ - Computes diff patch        │    │ - Captures partial stdout/stderr │
 │ - Generates file inventory   │    │ - Inventory of partial changes   │
 │ - Computes work_result_id    │    │ - Updates status to interrupted  │
 │ - Returns WorkResult payload │    │ - Returns recovery descriptor    │
 └──────────────┬───────────────┘    └──────────────────────────────────┘
                │
                ▼
 6. DisposeWorkspace(workspace)
                │
                ▼
 ┌──────────────────────────────┐
 │ - Idempotently removes dir   │
 │ - Updates status to disposed │
 └──────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/workspace-descriptor/v1.schema.json` | Create | JSON Schema for `workspace-descriptor/v1` declaring workspace_id, root_path, source_snapshot_id, status, created_at |
| `schemas/kernel/workspace-descriptor/fixtures/` | Create | Valid and invalid fixtures for `workspace-descriptor/v1` |
| `schemas/kernel/capsule-definition/v1.schema.json` | Create | JSON Schema for `capsule-definition/v1` declaring capsule_id, fingerprint, dependencies, allowed_paths, environment |
| `schemas/kernel/capsule-definition/fixtures/` | Create | Valid and invalid fixtures for `capsule-definition/v1` |
| `schemas/kernel/work-result-execution-payload/v1.schema.json` | Create | JSON Schema for `work-result-execution-payload/v1` prohibiting candidate_id |
| `schemas/kernel/work-result-execution-payload/fixtures/` | Create | Valid, invalid, and negative non-aliasing fixtures for work-result payloads |
| `schemas/kernel/containment-violation/v1.schema.json` | Create | JSON Schema for `containment-violation/v1` describing path violations |
| `schemas/kernel/containment-violation/fixtures/` | Create | Valid and invalid fixtures for `containment-violation/v1` |
| `schemas/kernel/manifest.json` | Modify | Register the 4 new schema families in kernel schemas manifest |
| `scripts/lib/worker-workspace.js` | Create | Workspace lifecycle management: `CreateWorkspace`, `MaterializeSourceSnapshot`, `DisposeWorkspace`, `InspectWorkspace` |
| `scripts/lib/allowed-paths-validator.js` | Create | Fail-closed path containment validator: `ValidateAllowedPaths`, `isPathContained` |
| `scripts/lib/worker-executor.js` | Create | Worker execution runtime: `ExecuteWorkOrder`, `CaptureWorkResult`, `RecoverInterruptedExecution` |
| `scripts/lib/contract-checkers/k6a-candidate-prohibition.js` | Create | Contract-lint checker verifying zero CandidateId emission/usage in K6a primitives |
| `scripts/lib/contract-checkers/k6a-capsule-path-containment.js` | Create | Contract-lint checker validating capsule allowed_paths and rejecting path traversals |
| `scripts/lib/contract-lint.js` | Modify | Register K6a contract checkers in `DEFAULT_REGISTRY` |
| `scripts/lib/lifecycle-model.js` | Modify | Add `K6A_EXECUTABLE_INVARIANTS` and implement executable checkers for the 6 K6a invariants |
| `scripts/lib/worker-workspace.test.js` | Create | Unit and integration tests for workspace lifecycle and capsule materialization |
| `scripts/lib/allowed-paths-validator.test.js` | Create | Unit and boundary tests for path containment validation |
| `scripts/lib/worker-executor.test.js` | Create | Unit and integration tests for worker execution, WorkResult capture, and recovery |
| `scripts/lib/k6a-schema-fixtures.test.js` | Create | Schema validation and negative non-aliasing fixture tests for K6a schemas |
| `scripts/lib/k6a-lifecycle-model.test.js` | Create | Conformance tests verifying all 6 K6a lifecycle model invariants |
| `scripts/lib/contract-checkers/k6a-checkers.test.js` | Create | Tests for CandidateId prohibition and capsule path containment lint checkers |

---

## Interfaces / Contracts

### 1. Workspace Descriptor (`workspace-descriptor/v1`)

```javascript
/**
 * @typedef {Object} WorkspaceDescriptor
 * @property {1} schema_version
 * @property {string} workspace_id - e.g. "ws-550e8400-e29b-41d4-a716-446655440000"
 * @property {string} root_path - Absolute directory path
 * @property {string} source_snapshot_id - Pattern ^sha256:[a-f0-9]{64}$
 * @property {"active"|"disposed"|"interrupted"} status
 * @property {string} created_at - ISO 8601 date string
 */
```

### 2. Capsule Definition (`capsule-definition/v1`)

```javascript
/**
 * @typedef {Object} CapsuleDefinition
 * @property {1} schema_version
 * @property {string} capsule_id
 * @property {string} fingerprint - Pattern ^sha256:[a-f0-9]{64}$
 * @property {string} source_snapshot_id - Pattern ^sha256:[a-f0-9]{64}$
 * @property {string[]} dependencies - Declared dependency paths
 * @property {string[]} allowed_paths - Sandboxed paths allowed for writes
 * @property {Object.<string, string>} environment
 */
```

### 3. Containment Violation (`containment-violation/v1`)

```javascript
/**
 * @typedef {Object} ContainmentViolation
 * @property {1} schema_version
 * @property {string} violation_id
 * @property {string} workspace_id
 * @property {string} work_order_id
 * @property {string} attempted_path
 * @property {string[]} allowed_paths
 * @property {"traversal"|"symlink_escape"|"undeclared_write"|"permission_denied"} violation_type
 * @property {string} timestamp - ISO 8601 date string
 */
```

### 4. Work Result Execution Payload (`work-result-execution-payload/v1`)

```javascript
/**
 * @typedef {Object} WorkResultExecutionPayload
 * @property {1} schema_version
 * @property {string} work_result_id - Pattern ^sha256:[a-f0-9]{64}$
 * @property {string} work_order_id - Pattern ^sha256:[a-f0-9]{64}$
 * @property {string} source_snapshot_id - Pattern ^sha256:[a-f0-9]{64}$
 * @property {string} patch - Unified diff
 * @property {Array<{command: string, exit_code: number, duration_ms: number}>} commands
 * @property {Array<{stream: "stdout"|"stderr", content: string}>|string[]} logs
 * @property {number} exit_code
 * @property {Array<{path: string, sha256: string, mode: number}>} filesystem_inventory
 * @property {Object} execution_usage - Resource consumption details
 */
```

### 5. Module Export Signatures

```javascript
// scripts/lib/worker-workspace.js
function createWorkspace(options = {}) => Promise<WorkspaceDescriptor>;
function materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, options = {}) => Promise<CapsuleDefinition>;
function disposeWorkspace(workspaceDescriptor) => Promise<{ ok: boolean, workspace_id: string, status: "disposed" }>;
function inspectWorkspace(workspaceDescriptor) => Promise<Array<{ path: string, sha256: string, mode: number }>>;

// scripts/lib/allowed-paths-validator.js
function validateAllowedPaths(targetPaths, allowedPaths, options = {}) => { ok: boolean, violation?: ContainmentViolation };
function isPathContained(targetPath, allowedPaths, workspaceRoot) => boolean;

// scripts/lib/worker-executor.js
function executeWorkOrder(options) => Promise<{ ok: boolean, workResult?: WorkResultExecutionPayload, recovery?: Object, violation?: ContainmentViolation }>;
function captureWorkResult(options) => Promise<WorkResultExecutionPayload>;
function recoverInterruptedExecution(options) => Promise<Object>;
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit: Workspace Lifecycle** | `CreateWorkspace`, `MaterializeSourceSnapshot`, `DisposeWorkspace`, idempotency, deterministic fingerprinting | `scripts/lib/worker-workspace.test.js` using temp fs fixtures |
| **Unit: Path Containment** | `ValidateAllowedPaths` against `../` traversal, external symlinks, undeclared writes, absolute escapes | `scripts/lib/allowed-paths-validator.test.js` with positive and negative path matrices |
| **Unit: Worker Execution** | `ExecuteWorkOrder`, `WorkerTransport` consumption, budget limits, exit code capture, error capture without crashes | `scripts/lib/worker-executor.test.js` using mock and reference transports |
| **Unit: Interrupted Recovery** | Timeout handling, abort signal interception, partial log capture, `interrupted` workspace state | `scripts/lib/worker-executor.test.js` with synthetic delays and abort controllers |
| **Schema & Fixtures** | Schema validation for all 4 families, negative non-aliasing against Candidate schemas | `scripts/lib/k6a-schema-fixtures.test.js` using `kernel-schema-validator.js` |
| **Contract Lint** | CandidateId non-emission and capsule path containment checkers | `scripts/lib/contract-checkers/k6a-checkers.test.js` and `scripts/lib/contract-lint.test.js` |
| **Lifecycle Conformance** | 6 K6a executable invariants in `lifecycle-model.js` | `scripts/lib/k6a-lifecycle-model.test.js` exercising Minimal Kernel Harness |

---

## Migration / Rollout

No data migration required. K6a introduces modular execution runtime primitives without modifying active fixed runtime routes, existing Authority Store records, or downstream shadow orchestration.

Rollback consists of reverting the PR/commit implementing K6a.

---

## Open Questions

None. All interfaces and requirements are fully specified.
