# Delta for lifecycle-model-conformance

## MODIFIED Requirements

### Requirement: Executable K6a Worker Isolation And Containment Invariants {#REQ-lifecycle-model-conformance-012}

The model suite MUST check all six executable K6a worker isolation invariants against the Minimal Kernel Harness and execution runtime:

1. `inv-k6a-workspace-lifecycle` MUST prove that every created workspace is registered in the private workspace registry with status `active`, captures `baselineInventory`, and is cleanly disposed with status `disposed` upon completion or teardown without directory or lock leaks.
2. `inv-k6a-capsule-determinism` MUST prove that identical canonical SourceSnapshot v1 and capsule inputs produce byte-identical capsule fingerprints without extraneous files or non-dependency repository artifacts.
3. `inv-k6a-containment-fail-closed` MUST prove that any file mutation within the delta (`created`, `modified`, `deleted`), relative path traversal (`../`), or symlink escape targeting a path outside declared `allowed_paths` halts execution fail-closed and emits a `containment-violation/v1` payload.
4. `inv-k6a-work-result-binding` MUST prove that `CaptureWorkResult` produces a canonical `work-result/v1` payload with applicable unified diff patch cryptographically bound via `computeWorkResultId` to `WorkOrderId` and `SourceSnapshotId`, and that K6a primitives never emit, accept, or return `CandidateId`.
5. `inv-k6a-interrupted-recovery-preservation` MUST prove that execution timeouts or `AbortSignal` cancellations preserve partial stdout/stderr logs and modified filesystem delta, producing an executable recovery state with workspace status `interrupted`.
6. `inv-k6a-host-isolation-fallback` MUST prove that asynchronous execution via `WorkerTransport` (`invokeTransportAsync`) reporting isolation capability state as `partial` or `unavailable` executes documented fallback without silent promotion to `enforced`.
(Previously: Invariants did not verify private workspace registry tracking, mutation delta calculation, async invokeTransportAsync execution, or AbortSignal cancellation.)

#### Scenario: Every K6a worker isolation invariant has an executable checker

- GIVEN the model suite manifest after K6a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K6a checker MAY be marked optional or deferred

#### Scenario: Model proves containment violation halts execution fail-closed

- GIVEN a worker execution state attempting to write to a path outside declared `allowed_paths`
- WHEN the model suite checks `inv-k6a-containment-fail-closed`
- THEN execution MUST halt immediately
- AND a structured containment violation payload MUST be emitted

#### Scenario: Model proves interrupted execution preserves partial telemetry

- GIVEN a model execution encountering a timeout or process cancellation
- WHEN `inv-k6a-interrupted-recovery-preservation` runs
- THEN partial logs and modified file inventory MUST be recorded in the recovery descriptor
- AND the workspace status MUST transition to `interrupted`
