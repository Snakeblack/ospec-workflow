# Delta for worker-isolation

## MODIFIED Requirements

### Requirement: Workspace Lifecycle Primitives {#REQ-worker-isolation-001}

The execution runtime MUST provide `CreateWorkspace` and `DisposeWorkspace` primitives backed by a private internal workspace registry. `CreateWorkspace` MUST allocate an isolated workspace directory, generate a unique `workspace_id` exclusively using a runtime-internal UUID, capture the initial `baseline_inventory`, and return a `workspace-descriptor/v1` payload declaring `workspace_id`, `root_path`, `source_snapshot_id`, and status `active`. The registry MUST be encapsulated and immutable from external callers. `DisposeWorkspace` MUST look up and remove the workspace directory solely through the private internal registry; if the workspace is not tracked in the registry, it MUST fail closed without attempting filesystem operations on caller-provided paths.
(Previously: Workspace ID could be supplied by the caller and disposal did not enforce strict registry encapsulation.)

#### Scenario: Provision fresh isolated workspace with internal UUID
- GIVEN a valid `source_snapshot_id` and optional workspace options
- WHEN `CreateWorkspace` is invoked
- THEN it MUST assign an internally generated UUID `workspace_id`
- AND MUST track the allocated directory in the private workspace registry with status `active`

#### Scenario: Caller-supplied workspace_id is ignored
- GIVEN workspace creation options containing a custom `workspace_id`
- WHEN `CreateWorkspace` is invoked
- THEN it MUST ignore the custom ID and generate an internal UUID

#### Scenario: Dispose workspace removes directory idempotently via registry
- GIVEN an active workspace descriptor tracked in the private registry
- WHEN `DisposeWorkspace` is invoked
- THEN the workspace directory MUST be deleted and registry record removed
- AND subsequent invocations on the same descriptor MUST succeed without error

#### Scenario: Dispose unrecorded workspace fails closed
- GIVEN a workspace descriptor whose `workspace_id` is absent from the private registry
- WHEN `DisposeWorkspace` is invoked
- THEN it MUST NOT perform file deletions on unverified paths and MUST return status `disposed`

---

### Requirement: Minimal Work-Order Capsule Materialization {#REQ-worker-isolation-002}

The execution runtime MUST provide `MaterializeSourceSnapshot` to construct a minimal execution capsule. The primitive MUST consume DAG `dependencies` as SHA-256 WorkOrder IDs (`sha256:...`) and project files strictly from `capsule_inputs: string[]` manifest. `MaterializeSourceSnapshot` MUST look up the workspace exclusively in the private internal registry and MUST fail closed if the workspace is not registered. It MUST compute a deterministic SHA-256 `fingerprint` over declared inputs, and store authentic baseline file contents in the workspace record for subsequent unified diff generation.
(Previously: Materialization permitted unrecorded workspaces via fallback to root_path and did not preserve baseline content.)

#### Scenario: Materialize canonical snapshot decoupled from DAG dependency IDs
- GIVEN a canonical WorkOrder v2 declaring SHA-256 DAG dependencies and a canonical SourceSnapshot v1
- WHEN `MaterializeSourceSnapshot` is invoked with explicit capsule inputs
- THEN only declared capsule input files MUST be materialized in the workspace
- AND extraneous repository files outside declared inputs MUST NOT be present

#### Scenario: Deterministic capsule fingerprint across identical inputs
- GIVEN two independent materialization requests with identical source snapshot content and capsule inputs
- WHEN `MaterializeSourceSnapshot` produces their capsule descriptors
- THEN both descriptors MUST yield identical `fingerprint` digest values

#### Scenario: Materialization fails closed for unrecorded workspace
- GIVEN a workspace descriptor not tracked in the private workspace registry
- WHEN `MaterializeSourceSnapshot` is invoked
- THEN it MUST throw an error and refuse materialization without accessing fallback paths

#### Scenario: Baseline file content preserved for diffing
- GIVEN valid capsule inputs materialized into a tracked workspace
- WHEN `MaterializeSourceSnapshot` completes
- THEN the internal workspace record MUST retain baseline file contents alongside baseline inventory

---

### Requirement: Strict Filesystem Containment And Path Validation {#REQ-worker-isolation-003}

The execution runtime MUST provide `ValidateAllowedPaths` and `checkSymlinkEscape` to enforce filesystem containment. The validator MUST compute the filesystem mutation delta (`created`, `modified`, `deleted`) against `baselineInventory` and evaluate paths strictly on the delta against declared `allowed_paths`. `checkSymlinkEscape` MUST fail closed upon detecting relative path traversal (`../`), symlink escapes outside the workspace root, or if any filesystem exception or `realpathSync` failure occurs during path inspection.
(Previously: Symlink escape checks swallowed filesystem exceptions and realpathSync errors instead of failing closed.)

#### Scenario: Mutation delta within allowed_paths passes containment validation
- GIVEN a filesystem mutation delta strictly located within declared `allowed_paths`
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST succeed with `{ ok: true }`

#### Scenario: Relative path traversal or symlink escape fails closed
- GIVEN an attempted file operation or symlink resolving outside workspace boundaries via `../` or external target
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST return `{ ok: false }`
- AND MUST emit a `containment-violation/v1` descriptor identifying the offending path and violation type

#### Scenario: Filesystem realpath exception fails closed as containment violation
- GIVEN a target path whose ancestor triggers an exception or unresolvable link during `realpathSync`
- WHEN `checkSymlinkEscape` or `ValidateAllowedPaths` is executed
- THEN validation MUST fail closed and emit a `containment-violation/v1` with `violation_type: "symlink_escape"`

---

### Requirement: Worker Execution Engine And Host Transport Integration {#REQ-worker-isolation-004}

The execution runtime MUST provide `ExecuteWorkOrder` consuming the `WorkerTransport` port via `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })`. `ExecuteWorkOrder` MUST accept a valid `work-order/v2` payload, isolated workspace descriptor, execution budget envelope, and optional `AbortSignal`. It MUST propagate signals and deadlines to the transport, preserve telemetry (`stdout`, `stderr`, `exit_code`) across `normalizeTransportOutcome`, and for local subprocess fallback MUST await the child process `'close'` event before triggering interrupted recovery.
(Previously: invokeTransportAsync had mismatched argument ordering, telemetry was dropped in normalization, and local subprocess recovery suffered race conditions.)

#### Scenario: Asynchronous execution via WorkerTransport with signal and deadline propagation
- GIVEN a valid WorkOrder v2, active workspace descriptor, and available WorkerTransport
- WHEN `ExecuteWorkOrder` executes a command
- THEN it MUST invoke `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })`
- AND execution telemetry (`exit_code`, logs, duration) MUST be captured

#### Scenario: Telemetry preservation across transport normalization
- GIVEN a WorkerTransport returning structured stdout, stderr, and exit code
- WHEN `ExecuteWorkOrder` processes the transport outcome through `normalizeTransportOutcome`
- THEN stdout, stderr, and exit code MUST be preserved intact in command outcomes and logs

#### Scenario: Local subprocess execution awaits close event before recovery
- GIVEN a spawned local subprocess receiving an abort signal or timing out
- WHEN recovery is triggered
- THEN the runtime MUST await the child process `'close'` event before finalizing recovery state

#### Scenario: Host execution error is captured without runtime crash
- GIVEN an execution command returning a non-zero exit code or host transport error
- WHEN `ExecuteWorkOrder` executes the command
- THEN the runtime MUST capture failure status and error logs without throwing an unhandled exception

---

### Requirement: Raw Work Result Capture And Cryptographic Binding {#REQ-worker-isolation-005}

The execution runtime MUST provide `CaptureWorkResult` to assemble execution outputs into a canonical `work-result/v1` payload. The payload MUST include `work_result_id`, `work_order_id`, `source_snapshot_id`, `patch`, `commands`, `logs`, `exit_code`, and `filesystem_inventory`. The `patch` MUST contain an applicable unified diff generated with standard diff headers (`--- a/...`, `+++ b/...`) and authentic diff hunks comparing post-execution contents against preserved baseline file contents. The `work_result_id` MUST be computed strictly delegating to `computeWorkResultId` from `execution-identities`.
(Previously: Unified diff generated placeholder -old hunks instead of comparing actual baseline file contents.)

#### Scenario: Capture canonical WorkResult with applicable unified diff hunks
- GIVEN an executed workspace with modified files and preserved baseline file contents
- WHEN `CaptureWorkResult` is invoked
- THEN `patch` MUST contain standard unified diff hunks reflecting exact baseline-to-post modifications
- AND `work_result_id` MUST match `computeWorkResultId(workResult)`

#### Scenario: Captured WorkResult validates cryptographic binding
- GIVEN a captured `WorkResult` and its source `WorkOrder`
- WHEN `validateWorkResultBinding(workOrder, workResult)` is evaluated
- THEN validation MUST succeed with `{ ok: true }`

#### Scenario: File creation and deletion use standard diff headers
- GIVEN an execution that created new files and deleted baseline files
- WHEN `CaptureWorkResult` generates the patch
- THEN created files MUST use `--- /dev/null` / `+++ b/{path}` and deleted files MUST use `--- a/{path}` / `+++ /dev/null`

---

### Requirement: Interrupted Execution Preservation And Recovery {#REQ-worker-isolation-006}

The execution runtime MUST provide `RecoverInterruptedExecution` to handle timeouts, process aborts, or cancellation signals. Upon receiving an `AbortSignal` or exceeding budget limits, the runtime MUST terminate running child processes, await process termination and stream settlement, preserve partial stdout/stderr logs, and capture the mutation delta, producing an executable recovery descriptor with workspace status `interrupted`.
(Previously: Recovery did not ensure child process close events were settled before capturing mutation delta.)

#### Scenario: Timeout or abort triggers interrupted recovery capture
- GIVEN an in-flight execution that receives an abort signal or exceeds its time budget
- WHEN execution is halted
- THEN `RecoverInterruptedExecution` MUST record partial logs and the modified file delta after process termination settles
- AND the workspace descriptor status MUST be updated to `interrupted`

#### Scenario: Partial logs and modified files preserved in recovery descriptor
- GIVEN an interrupted execution state
- WHEN the recovery descriptor is inspected
- THEN partial stderr/stdout streams and modified paths MUST be present and non-empty

---

### Requirement: Host Isolation Capability Fallback {#REQ-worker-isolation-008}

Reporting `isolationReported = "enforced"` MUST strictly require a verified active `WorkerTransport` coupled to host-level sandboxing. When the host adapter indicates capability state `enforced` but no active `WorkerTransport` is provided, the runtime MUST fail closed and reject execution. When capability state is `partial` or `instructional`, or when running local process execution without sandboxing, the runtime MUST execute with software boundary enforcement, log the capability state, and MUST NOT report `enforced`. When the host adapter indicates `unavailable`, the runtime MUST execute explicit fallback handling or fail closed.
(Previously: Local subprocess spawning could report isolationReported = "enforced" without an active WorkerTransport.)

#### Scenario: Enforced capability executes with sandbox and verified WorkerTransport
- GIVEN a host adapter declaring `isolation: enforced` with valid `CapabilityProof` and active `WorkerTransport`
- WHEN `ExecuteWorkOrder` is executed
- THEN execution MUST utilize host-enforced sandboxing and report `isolationReported: "enforced"`

#### Scenario: Enforced capability without WorkerTransport fails closed
- GIVEN a host configuration requesting `isolationCapability: "enforced"` without a valid `WorkerTransport`
- WHEN `ExecuteWorkOrder` is executed
- THEN the runtime MUST fail closed and refuse execution without sandboxing

#### Scenario: Partial or unavailable capability executes local fallback without silent promotion
- GIVEN a host adapter declaring `isolation: unavailable` or `isolation: partial` without sandboxed transport
- WHEN `ExecuteWorkOrder` executes via local subprocess
- THEN the runtime MUST record `isolationReported` as `partial` or `unavailable`
- AND MUST NOT assert or record `enforced` status
