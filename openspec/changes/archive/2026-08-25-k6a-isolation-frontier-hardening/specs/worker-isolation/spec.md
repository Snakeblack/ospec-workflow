# Delta for worker-isolation

## ADDED Requirements

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

## MODIFIED Requirements

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
