# worker-isolation Specification

## Purpose

Define the execution runtime primitives, minimal work-order capsule materialization,
filesystem containment enforcement, raw work result capture, interrupted execution
recovery, host transport integration, and strict identity boundary enforcement
without emitting or assuming CandidateId.

## Requirements

### Requirement: Workspace Lifecycle Primitives {#REQ-worker-isolation-001}

The execution runtime MUST provide `CreateWorkspace` and `DisposeWorkspace` primitives.
`CreateWorkspace` MUST allocate an isolated workspace directory, generate a unique `workspace_id`,
and return a `workspace-descriptor/v1` payload declaring `workspace_id`, `root_path`, `source_snapshot_id`,
and status `active`. `DisposeWorkspace` MUST clean up the allocated directory and release all resources
idempotently; calling `DisposeWorkspace` multiple times on the same workspace MUST NOT cause an unhandled error.

#### Scenario: Provision fresh isolated workspace

- GIVEN a valid `source_snapshot_id`
- WHEN `CreateWorkspace` is invoked
- THEN it MUST return a workspace descriptor with status `active`
- AND MUST create a dedicated directory on the filesystem

#### Scenario: Dispose workspace removes directory and releases resources idempotently

- GIVEN an active workspace descriptor
- WHEN `DisposeWorkspace` is invoked
- THEN the workspace directory MUST be removed
- AND a subsequent `DisposeWorkspace` call on the same descriptor MUST succeed without error

---

### Requirement: Minimal Work-Order Capsule Materialization {#REQ-worker-isolation-002}

The execution runtime MUST provide `MaterializeSourceSnapshot` to construct a minimal execution
capsule derived exclusively from declared dependencies in the WorkOrder/Execution Graph.
The primitive MUST project the snapshot files into the isolated workspace and compute a deterministic
SHA-256 `fingerprint` over the materialized files and declared dependencies. Extraneous repository
artifacts, git metadata, and undeclared files MUST NOT be materialized into the capsule.

#### Scenario: Materialize snapshot containing declared dependency files only

- GIVEN a valid WorkOrder declaring explicit dependency paths and a `source_snapshot_id`
- WHEN `MaterializeSourceSnapshot` is invoked for an active workspace
- THEN only declared dependency files and declared snapshot assets MUST be written to the workspace
- AND extraneous repository files outside declared dependencies MUST NOT be present

#### Scenario: Deterministic capsule fingerprint across identical dependency inputs

- GIVEN two independent materialization requests with identical source snapshot content and dependencies
- WHEN `MaterializeSourceSnapshot` produces their capsule descriptors
- THEN both descriptors MUST yield identical `fingerprint` digest values

---

### Requirement: Strict Filesystem Containment And Path Validation {#REQ-worker-isolation-003}

The execution runtime MUST provide `ValidateAllowedPaths` to enforce filesystem containment.
The validator MUST evaluate all file modifications, creations, and target paths against the declared
`allowed_paths` list of the WorkOrder. The validator MUST fail closed and emit a `containment-violation/v1`
descriptor upon detecting any relative path traversal (e.g. `../`), symlink target outside workspace root,
or write operation to an undeclared path.

#### Scenario: Writes within allowed_paths pass containment validation

- GIVEN a list of modified files strictly located within declared `allowed_paths`
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST succeed with `{ ok: true }`

#### Scenario: Relative path traversal or symlink escape fails closed

- GIVEN an attempted file operation resolving outside workspace boundaries via `../` or an external symlink
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST return `{ ok: false }`
- AND MUST emit a `containment-violation/v1` descriptor identifying the offending path and violation type

---

### Requirement: Worker Execution Engine And Host Transport Integration {#REQ-worker-isolation-004}

The execution runtime MUST provide `ExecuteWorkOrder` consuming the `WorkerTransport` port from the
reference host adapter (`claude`) or Headless Conformance Host. `ExecuteWorkOrder` MUST accept a valid
`work-order/v2` payload, isolated workspace descriptor, execution budget envelope, and execution command.
It MUST execute the command within the workspace and capture process exit codes, stdout/stderr streams,
and execution timing.

#### Scenario: Successful execution via WorkerTransport

- GIVEN a valid WorkOrder, active workspace descriptor, and available WorkerTransport
- WHEN `ExecuteWorkOrder` runs a conforming execution command
- THEN the execution MUST run within the isolated workspace
- AND execution telemetry (exit code, logs, duration) MUST be captured without errors

#### Scenario: Host execution error is captured without runtime crash

- GIVEN an execution command returning a non-zero exit code or error output
- WHEN `ExecuteWorkOrder` executes the command
- THEN the runtime MUST capture the failure status and error logs
- AND MUST NOT throw an unhandled exception

---

### Requirement: Raw Work Result Capture And Cryptographic Binding {#REQ-worker-isolation-005}

The execution runtime MUST provide `CaptureWorkResult` to assemble execution outputs into a canonical
`WorkResult` payload. The payload MUST include `work_result_id`, `work_order_id`, `source_snapshot_id`,
`patch`, `commands`, `logs`, `exit_code`, and `filesystem_inventory`. The `work_result_id` MUST be computed
cryptographically over the execution artifacts, binding the result immutably to `work_order_id` and
`source_snapshot_id`.

#### Scenario: Capture complete WorkResult from workspace modifications

- GIVEN an executed workspace with modified files, command logs, and exit code 0
- WHEN `CaptureWorkResult` is invoked
- THEN it MUST return a valid `WorkResult` payload containing the diff patch and complete filesystem inventory
- AND `work_result_id` MUST match `computeWorkResultId(workResult)`

#### Scenario: Captured WorkResult validates cryptographic binding

- GIVEN a captured `WorkResult` and its source `WorkOrder`
- WHEN `validateWorkResultBinding(workOrder, workResult)` is evaluated
- THEN validation MUST succeed with `{ ok: true }`

---

### Requirement: Interrupted Execution Preservation And Recovery {#REQ-worker-isolation-006}

The execution runtime MUST provide `RecoverInterruptedExecution` to handle timeouts, process aborts,
or cancellation signals. Upon interruption, the runtime MUST preserve all partial stdout/stderr logs,
intermediate file modifications, and execution timestamps, producing an executable recovery descriptor
that allows inspection or subsequent diagnostic transitions without losing raw telemetry.

#### Scenario: Timeout or abort triggers interrupted recovery capture

- GIVEN an in-flight `ExecuteWorkOrder` execution that receives an abort signal or exceeds its time budget
- WHEN execution is halted
- THEN `RecoverInterruptedExecution` MUST record the partial logs and modified file inventory
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
