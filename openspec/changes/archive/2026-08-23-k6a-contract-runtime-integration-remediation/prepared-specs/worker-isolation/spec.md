# worker-isolation Specification

## Purpose

Define the execution runtime primitives, minimal work-order capsule materialization,
filesystem containment enforcement, raw work result capture, interrupted execution
recovery, host transport integration, and strict identity boundary enforcement
without emitting or assuming CandidateId.

## Requirements

### Requirement: Workspace Lifecycle Primitives {#REQ-worker-isolation-001}

The execution runtime MUST provide `CreateWorkspace` and `DisposeWorkspace` primitives backed by a private internal workspace registry (`workspace_id -> internal descriptor`). `CreateWorkspace` MUST allocate an isolated workspace directory, generate a unique `workspace_id`, capture the initial `baseline_inventory`, and return a `workspace-descriptor/v1` payload declaring `workspace_id`, `root_path`, `source_snapshot_id`, and status `active`. `DisposeWorkspace` MUST look up the workspace exclusively via the private registry to prevent arbitrary path traversal, clean up the directory, and release all resources idempotently; calling `DisposeWorkspace` multiple times on the same workspace MUST NOT cause an unhandled error.
(Previously: Workspace lifecycle did not maintain a private workspace registry or capture baseline inventory.)

#### Scenario: Provision fresh isolated workspace with registry tracking

- GIVEN a valid `source_snapshot_id`
- WHEN `CreateWorkspace` is invoked
- THEN it MUST return a workspace descriptor with status `active`
- AND MUST track the allocated directory in the private workspace registry

#### Scenario: Dispose workspace removes directory and releases resources idempotently

- GIVEN an active workspace descriptor tracked in the private registry
- WHEN `DisposeWorkspace` is invoked
- THEN the workspace directory MUST be removed
- AND a subsequent `DisposeWorkspace` call on the same descriptor MUST succeed without error

---

### Requirement: Minimal Work-Order Capsule Materialization {#REQ-worker-isolation-002}

The execution runtime MUST provide `MaterializeSourceSnapshot` to construct a minimal execution capsule derived from canonical `SourceSnapshot v1` and `WorkOrder v2` contracts. The primitive MUST consume DAG `dependencies` as an array of SHA-256 WorkOrder IDs (`sha256:...`) and materialize files exclusively from `SourceSnapshot v1` via projection or explicit `capsule_inputs: string[]` manifest. It MUST compute a deterministic SHA-256 `fingerprint` over the materialized files and inputs. Extraneous repository artifacts, git metadata, and undeclared files MUST NOT be materialized into the capsule.
(Previously: Materialization assumed WorkOrder.dependencies were file paths and SourceSnapshot contained a synthetic .files map.)

#### Scenario: Materialize canonical snapshot decoupled from DAG dependency IDs

- GIVEN a canonical WorkOrder v2 declaring SHA-256 DAG dependencies and a canonical SourceSnapshot v1
- WHEN `MaterializeSourceSnapshot` is invoked with explicit capsule inputs
- THEN only declared capsule input files MUST be materialized in the workspace
- AND extraneous repository files outside declared inputs MUST NOT be present

#### Scenario: Deterministic capsule fingerprint across identical inputs

- GIVEN two independent materialization requests with identical source snapshot content and capsule inputs
- WHEN `MaterializeSourceSnapshot` produces their capsule descriptors
- THEN both descriptors MUST yield identical `fingerprint` digest values

---

### Requirement: Strict Filesystem Containment And Path Validation {#REQ-worker-isolation-003}

The execution runtime MUST provide `ValidateAllowedPaths` to enforce filesystem containment. The validator MUST compute the filesystem mutation delta (`created`, `modified`, `deleted`) against `baselineInventory` and evaluate paths strictly on the delta against declared `allowed_paths`. The validator MUST fail closed and emit a `containment-violation/v1` descriptor upon detecting relative path traversal (e.g. `../`), symlink escapes outside the workspace root, or symlinks pointing through non-instantiated ancestor hierarchies.
(Previously: Allowed paths validation operated on the entire inventory rather than isolating the mutation delta.)

#### Scenario: Mutation delta within allowed_paths passes containment validation

- GIVEN a filesystem mutation delta strictly located within declared `allowed_paths`
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST succeed with `{ ok: true }`

#### Scenario: Relative path traversal or symlink escape fails closed

- GIVEN an attempted file operation or symlink resolving outside workspace boundaries via `../` or external target
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST return `{ ok: false }`
- AND MUST emit a `containment-violation/v1` descriptor identifying the offending path and violation type

---

### Requirement: Worker Execution Engine And Host Transport Integration {#REQ-worker-isolation-004}

The execution runtime MUST provide `ExecuteWorkOrder` consuming the `WorkerTransport` port via `invokeTransportAsync`. `ExecuteWorkOrder` MUST accept a valid `work-order/v2` payload, isolated workspace descriptor, execution budget envelope (`wall_time_minutes`, `commands`), and optional `AbortSignal`. It MUST verify host capability state with `resolveCapabilityState` and execute asynchronously within the workspace, capturing exit codes, stdout/stderr streams, command durations, and execution usage.
(Previously: Execution was synchronous without native invokeTransportAsync, AbortSignal support, or capability resolution.)

#### Scenario: Asynchronous execution via WorkerTransport with capability verification

- GIVEN a valid WorkOrder v2, active workspace descriptor, and available WorkerTransport
- WHEN `ExecuteWorkOrder` runs an execution command
- THEN the command MUST execute asynchronously via `invokeTransportAsync` within the isolated workspace
- AND execution telemetry (exit code, logs, duration, usage) MUST be captured

#### Scenario: Host execution error is captured without runtime crash

- GIVEN an execution command returning a non-zero exit code or host transport error
- WHEN `ExecuteWorkOrder` executes the command
- THEN the runtime MUST capture the failure status and error logs without throwing an unhandled exception

---

### Requirement: Raw Work Result Capture And Cryptographic Binding {#REQ-worker-isolation-005}

The execution runtime MUST provide `CaptureWorkResult` to assemble execution outputs into a canonical `work-result/v1` payload. The payload MUST include `work_result_id`, `work_order_id`, `source_snapshot_id`, `patch`, `commands`, `logs`, `exit_code`, and `filesystem_inventory`. The `patch` MUST contain an applicable unified diff representing exact modifications against the source snapshot. The `work_result_id` MUST be computed cryptographically strictly delegating to `computeWorkResultId` from `execution-identities`.
(Previously: Diff patch was a synthetic path list and work_result_id used a local duplicate hashing routine.)

#### Scenario: Capture canonical WorkResult with applicable unified diff

- GIVEN an executed workspace with modified files, command logs, and exit code 0
- WHEN `CaptureWorkResult` is invoked
- THEN it MUST return a valid `work-result/v1` payload containing an applicable unified diff patch
- AND `work_result_id` MUST match `computeWorkResultId(workResult)` from `execution-identities`

#### Scenario: Captured WorkResult validates cryptographic binding

- GIVEN a captured `WorkResult` and its source `WorkOrder`
- WHEN `validateWorkResultBinding(workOrder, workResult)` is evaluated
- THEN validation MUST succeed with `{ ok: true }`

---

### Requirement: Interrupted Execution Preservation And Recovery {#REQ-worker-isolation-006}

The execution runtime MUST provide `RecoverInterruptedExecution` to handle timeouts, process aborts, or cancellation signals. Upon receiving an `AbortSignal` or exceeding K5 budget limits (`wall_time_minutes`), the runtime MUST terminate running child processes, preserve partial stdout/stderr logs, and capture the mutation delta, producing an executable recovery descriptor with workspace status `interrupted`.
(Previously: Recovery was synchronous without child process termination or mutation delta capture.)

#### Scenario: Timeout or abort triggers interrupted recovery capture

- GIVEN an in-flight `ExecuteWorkOrder` execution that receives an abort signal or exceeds its time budget
- WHEN execution is halted
- THEN `RecoverInterruptedExecution` MUST record partial logs and the modified file delta
- AND the workspace descriptor status MUST be updated to `interrupted`

#### Scenario: Partial logs and modified files preserved in recovery descriptor

- GIVEN an interrupted execution state
- WHEN the recovery descriptor is inspected
- THEN partial stderr/stdout streams and modified paths MUST be present and non-empty

---

### Requirement: Strict Identity Boundary And CandidateId Prohibition {#REQ-worker-isolation-007}

K6a execution primitives, schemas, fixtures, and output payloads MUST NOT emit, accept, return, or assume
`CandidateId` or Candidate schema structures. `WorkResult` MUST remain raw unapproved execution evidence.
The workspace filesystem inventory MUST NOT be accepted or aliased as an approved candidate tree.
Public APIs of K6a MUST NOT expose Repair domain concepts, graph compilation terms, or shadow orchestration controls.

#### Scenario: WorkResult output contains zero CandidateId fields

- GIVEN any `WorkResult` payload produced by K6a primitives
- WHEN inspected for candidate identifiers
- THEN no `candidate_id` or Candidate schema discriminator property MAY be present

#### Scenario: K6a public API surface contains no Repair or Candidate terminology

- GIVEN the exported API signatures and schema definitions of K6a
- WHEN inspected for domain leaks
- THEN terms including `freezeCandidate`, `RepairShadow`, and `CandidateEvaluationAttestation` MUST be absent

---

### Requirement: Host Isolation Capability Fallback {#REQ-worker-isolation-008}

When the host adapter indicates capability state `enforced`, the runtime MUST execute inside host-level
sandboxing. When the host adapter indicates `partial` or `instructional`, the runtime MUST execute with
software boundary enforcement and log the capability state. When the host adapter indicates `unavailable`,
the runtime MUST execute explicit fallback handling or fail closed, and MUST NOT silently promote the state to `enforced`.

#### Scenario: Enforced capability executes with sandbox

- GIVEN a host adapter declaring `isolation: enforced` with valid `CapabilityProof`
- WHEN `ExecuteWorkOrder` is executed
- THEN execution MUST utilize host-enforced sandboxing

#### Scenario: Partial or unavailable capability triggers documented fallback without silent promotion

- GIVEN a host adapter declaring `isolation: unavailable` or `isolation: partial`
- WHEN `ExecuteWorkOrder` is executed
- THEN the runtime MUST execute documented fallback path and record capability status
- AND MUST NOT assert or record `enforced` status
