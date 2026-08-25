# worker-isolation Specification

## Purpose

Define the execution runtime primitives, minimal work-order capsule materialization,
filesystem containment enforcement, raw work result capture, interrupted execution
recovery, host transport integration, and strict identity boundary enforcement
without emitting or assuming CandidateId.

## Requirements

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

---

### Requirement: Host Isolation Capability Fallback {#REQ-worker-isolation-008}

Reporting `isolationReported = "enforced"` MUST require a verified WorkerIsolation capability demonstrated on an active `WorkerTransport` (software-boundary; MUST NOT require an OS jail). When the host adapter indicates `enforced` but no active matching `WorkerTransport` is provided, the runtime MUST fail closed and reject execution. Command execution through `ExecuteWorkOrder` MUST fail closed unless `isolationReported` is `enforced`. When capability state is `partial`, `instructional`, or `unavailable`, the runtime MUST refuse commands and MUST NOT report `enforced`. Non-command K6a primitives (workspace lifecycle, materialization, path validation, result capture) MAY continue under local software-boundary enforcement without claiming `enforced`.
(Previously: partial/instructional/unavailable could execute commands via local subprocess fallback with software-boundary logging, provided they did not report enforced.)

#### Scenario: Enforced capability executes with sandbox and verified WorkerTransport

- GIVEN a host adapter declaring WorkerIsolation `enforced` with valid `CapabilityProof` and active matching `WorkerTransport`
- WHEN `ExecuteWorkOrder` is executed with commands
- THEN execution MUST use that sandboxed transport
- AND MUST report `isolationReported: "enforced"`

#### Scenario: Enforced capability without WorkerTransport fails closed

- GIVEN a host configuration requesting `isolationCapability: "enforced"` without a valid `WorkerTransport`
- WHEN `ExecuteWorkOrder` is executed
- THEN the runtime MUST fail closed and refuse execution without sandboxing

#### Scenario: Partial instructional or unavailable refuses commands

- GIVEN a host adapter declaring isolation `partial`, `instructional`, or `unavailable` without enforced WorkerIsolation
- WHEN `ExecuteWorkOrder` is invoked with one or more commands
- THEN the runtime MUST fail closed and MUST NOT execute those commands
- AND MUST NOT record `isolationReported: "enforced"`

#### Scenario: Non-command primitives may use software boundary without enforced

- GIVEN isolation state `partial` or `unavailable` and a work order with no command list
- WHEN a non-command K6a primitive runs (create/dispose workspace, materialize, validate paths, capture result)
- THEN the primitive MAY complete under software-boundary enforcement
- AND MUST NOT assert or record `enforced`

---

### Requirement: 3-Way Cryptographic Binding and Byte-Exact Merkle Tree Digest {#REQ-worker-isolation-009}

`MaterializeSourceSnapshot` MUST enforce 3-way equality binding between the workspace record, the `workOrder`, and the `sourceSnapshot` (`record.descriptor.source_snapshot_id === workOrder.source_snapshot_id === sourceSnapshot.source_snapshot_id`) before creating any file on disk. `computeTreeDigest` MUST compute deterministic SHA-256 digests over exact raw bytes without newline substitution or UTF-8 decoding of binary buffers, ensuring distinct Merkle digests for CRLF vs LF line endings. When file entries declare a SHA-256 digest, `computeTreeDigest` MUST recompute the digest over candidate bytes and fail closed if the declared hash does not match.

#### Scenario: 3-Way binding validation prevents snapshot mismatch execution
- GIVEN a workspace registered for SourceSnapshot A and a WorkOrder compiled for SourceSnapshot B
- WHEN `MaterializeSourceSnapshot` is invoked
- THEN it MUST reject materialization and throw a 3-way binding mismatch error

#### Scenario: Byte-exact hashing distinguishes CRLF and LF byte streams
- GIVEN two identical file buffers differing only by CRLF vs LF line endings
- WHEN `computeTreeDigest` is evaluated on each
- THEN it MUST produce distinct SHA-256 Merkle root tree digests

#### Scenario: Declared SHA-256 mismatch halts fail-closed
- GIVEN a file item declaring a mismatched SHA-256 digest compared to its candidate bytes
- WHEN `computeTreeDigest` processes the item
- THEN it MUST throw a cryptographic verification error and fail closed

---

---

### Requirement: Transport Capability Binding, Async Settlement Barrier, and Git Mode Diffing {#REQ-worker-isolation-010}

`invokeTransportAsync` MUST enforce an asynchronous cancellation settlement barrier by awaiting `port.cancel()`, `port.terminate()`, or `port.abort()` before resolving or rejecting on timeout or abort signals. `generateUnifiedDiff` MUST include git-style mode change headers (`old mode 100644\nnew mode 100755`) whenever file permissions change, both for content-modified files and mode-only modified files. `recoverInterruptedExecution` and `inspectWorkspace` MUST resolve workspace roots exclusively from the private workspace registry.

#### Scenario: Async cancellation settlement barrier settles before returning failure
- GIVEN an active transport port whose cancellation/termination method returns a Promise
- WHEN execution is aborted or exceeds deadline
- THEN `invokeTransportAsync` MUST await the completion of the cancellation before returning the failure outcome

#### Scenario: Mode changes emit standard git diff mode headers
- GIVEN a file whose mode was changed from `100644` to `100755`
- WHEN `generateUnifiedDiff` constructs the patch
- THEN the patch MUST contain `old mode 100644\nnew mode 100755` headers

#### Scenario: Workspace recovery resolves root path strictly via private registry
- GIVEN a recovery request containing a forged or external `root_path` on an unrecorded or mismatched descriptor
- WHEN `RecoverInterruptedExecution` is invoked
- THEN it MUST inspect only the authoritative directory registered in the private workspace registry

---

### Requirement: Immutable Captured Sandbox Policy {#REQ-worker-isolation-011}

The sandbox preload MUST capture `{workspaceRoot, allowedPaths}` once into an immutable closure at load. `confineChildEnv` MUST rebuild each child environment from that captured snapshot and MUST NOT read live `process.env` for `OSPEC_SANDBOX_WORKSPACE_ROOT` or `OSPEC_SANDBOX_ALLOWED_PATHS`. After those OS variables are mutated, `spawn`, `execFile`, and `fork` MUST still confine the child to the original `allowed_paths`. Closed v2.47.1 `env:{}` / `NODE_OPTIONS` inheritance and fake-basename `node` (`realpath(process.execPath)`) guards MUST remain in force. `isolationReported=enforced` remains a software-boundary claim; an OS/container/syscall jail MUST NOT be required.

#### Scenario: Mutated OSPEC_SANDBOX_* does not expand child allowed_paths

- GIVEN a loaded sandbox whose captured policy is `{workspaceRoot: W, allowedPaths: P}`
- WHEN `OSPEC_SANDBOX_WORKSPACE_ROOT` or `OSPEC_SANDBOX_ALLOWED_PATHS` is mutated and the process then `spawn`s, `execFile`s, or `fork`s
- THEN the child MUST still be confined to original P under W
- AND child `OSPEC_SANDBOX_*` MUST match the captured snapshot, not live `process.env`

#### Scenario: Closed inheritance and execPath guards stay green

- GIVEN a sandboxed child spawn after this change
- WHEN confinement is applied
- THEN parent env MUST NOT leak via inheritance (`env:{}` / `NODE_OPTIONS`)
- AND a fake basename `node` MUST NOT substitute for `realpath(process.execPath)`

---

---

### Requirement: Exhaustive Mutating Filesystem Wrap {#REQ-worker-isolation-012}

The sandbox MUST wrap remaining Node 22+ mutating `fs` / `fs/promises` APIs, including `mkdtemp*`, `chmod*`, `chown*`, `utimes*`, `lutimes*`, `mkdtempDisposable*`, and equivalent sync, callback, promise, and disposable styles. A mutation whose target resolves outside captured `allowed_paths` MUST fail closed at the wrapper. Post-flight inventory via `ValidateAllowedPaths` MUST NOT be the sole containment check. This wrap is a software boundary; it MUST NOT be specified as an OS jail.

#### Scenario: Undeclared mutating fs API fails closed at the wrapper

- GIVEN a sandboxed worker whose captured `allowed_paths` excludes target T
- WHEN the worker invokes a wrapped mutating API (`mkdtemp*`, `chmod*`, `chown*`, `utimes*`, `lutimes*`, or `mkdtempDisposable*`, any style) against T
- THEN the wrapper MUST fail closed before the mutation is applied
- AND post-flight inventory MUST NOT be the only check that would have caught T

#### Scenario: Allowed mutating fs API succeeds inside captured paths

- GIVEN a sandboxed worker and a mutating fs target strictly inside captured `allowed_paths`
- WHEN the corresponding wrapped API is invoked
- THEN the call MAY succeed
- AND post-flight validation MUST still evaluate the resulting delta

---

---

### Requirement: Live Three-Way Containment Probe {#REQ-worker-isolation-013}

A WorkerIsolation containment probe MUST actually attempt three writes through the same executing `WorkerTransport` used for command dispatch: (1) a path inside declared `allowed_paths`, (2) an undeclared path inside the workspace, (3) a path under an external root. The host MUST observe `PASS` / `BLOCKED` / `BLOCKED` respectively. Vacuous `{blocked:true}` without attempted operations MUST NOT satisfy the probe. `isolationReported=enforced` MUST NOT be recorded unless that triple is observed on that transport.

#### Scenario: Probe records PASS / BLOCKED / BLOCKED on the executing transport

- GIVEN an active WorkerTransport with identity `port_id` / fingerprint F
- WHEN the containment probe runs through that transport
- THEN the allowed write MUST be attempted and observed `PASS`
- AND the undeclared workspace write MUST be attempted and observed `BLOCKED`
- AND the external-root write MUST be attempted and observed `BLOCKED`

#### Scenario: Vacuous blocked flag does not authorize enforced

- GIVEN a WorkerIsolation claim whose evidence is `{blocked:true}` with no attempted writes
- WHEN enforcement is evaluated
- THEN `isolationReported` MUST NOT become `enforced`

---

---

### Requirement: WorkerIsolation Bound To Executing WorkerTransport {#REQ-worker-isolation-014}

WorkerIsolation is a capability demonstrated on the executing `WorkerTransport`. `ExecuteWorkOrder` command dispatch, the containment probe, and WorkerIsolation `enforced` verification MUST share that transport's `port_id` / fingerprint. A different transport MUST invalidate `enforced`. WorkerIsolation MUST NOT be a sixth required host port. Command execution that reports `enforced` MUST NOT use unconfined `spawnSync` (or equivalent unconfined local spawn) as the execution path. K6a MUST NOT emit `CandidateId` or introduce K4b Repair/shadow/compiler surfaces.

#### Scenario: Matching executing transport may report enforced

- GIVEN a verified WorkerIsolation proof and a live three-way probe bound to WorkerTransport identity F
- WHEN `ExecuteWorkOrder` runs commands on the same transport F
- THEN the runtime MAY report `isolationReported: "enforced"`
- AND commands MUST travel that same transport, not an unconfined local spawn

#### Scenario: Different transport invalidates enforced

- GIVEN WorkerIsolation evidence bound to transport identity F
- WHEN `ExecuteWorkOrder` would execute on a different WorkerTransport G
- THEN the runtime MUST fail closed
- AND MUST NOT report `isolationReported: "enforced"`
