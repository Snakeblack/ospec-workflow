# Delta for lifecycle-model-conformance

## MODIFIED Requirements

### Requirement: Deferred Invariants Are Not Enforced In K2.1 {#REQ-lifecycle-model-conformance-004}

The suite MUST list, but MUST NOT claim runtime enforcement for, invariants owned by later slices, including Candidate mutation invalidation, candidate verification, review attestation, and delivery authorization. K2.1 Authority Store, OperationPermit/Receipt and effect-class invariants MUST NOT appear in the deferred list. K2a host-contract, CapabilityProof, no-silent-promotion, sole-reference-adapter and host-fault matrix invariants MUST NOT appear in the deferred list. K4a Execution Graph deterministic compile, SourceSnapshot provenance binding, PolicySnapshot digest binding, Obligation Manifest completeness, and fixture replay determinism invariants MUST NOT appear in the deferred list. K5 budget monotonicity, causal priority resolution, transition allowlist enforcement, zero-delta consumption, and honest recovery blocking fingerprint advancement invariants MUST NOT appear in the deferred list. K6a workspace lifecycle management, minimal capsule determinism, allowed_paths containment enforcement, WorkResult cryptographic binding, interrupted execution preservation, host isolation command fail-closed, captured sandbox policy immutability, WorkerIsolation transport binding, live three-way containment probe, and mutating-fs wrapper surface invariants MUST NOT appear in the deferred list.
(Previously: K6a non-deferred list named host isolation fallback that allowed command execution without enforced; frontier checkers for policy immutability, transport binding, real probe, and mutating-fs surface were absent.)

#### Scenario: Deferred invariant cannot satisfy K2.1 gate

- GIVEN a future invariant represented only by a placeholder or stub
- WHEN K2.1 conformance is evaluated
- THEN that placeholder MUST NOT be counted as an enforced K2.1 invariant

#### Scenario: CAS and permit invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for Authority Store CAS, OperationPermit single-use, or
  ambiguous irreversible retry bans
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K2.1 checkers

#### Scenario: K2a host invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for no concrete host imports, CapabilityProof-gated
  enforcement, or no silent promotion
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K2a checkers

#### Scenario: K4a Execution Graph and replay invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for deterministic Graph ID binding, PolicySnapshot effective rules, Obligation Manifest completeness, or fixture replay convergence
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K4a checkers

#### Scenario: K5 budget and recovery invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for budget monotonicity, causal priority resolution, zero-delta consumption, or honest recovery fingerprint advancement
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K5 checkers

#### Scenario: K6a worker isolation and containment invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for workspace lifecycle, capsule determinism, allowed_paths containment, WorkResult binding, interrupted recovery, command fail-closed without enforced, sandbox policy immutability, transport binding, live three-way probe, or mutating-fs surface
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K6a checkers

---

### Requirement: Executable K6a Worker Isolation And Containment Invariants {#REQ-lifecycle-model-conformance-012}

The model suite MUST check all ten executable K6a worker isolation invariants against the Minimal Kernel Harness and execution runtime:

1. `inv-k6a-workspace-lifecycle` MUST prove that every created workspace is registered in the private workspace registry with status `active`, captures `baselineInventory`, and is cleanly disposed with status `disposed` upon completion or teardown without directory or lock leaks.
2. `inv-k6a-capsule-determinism` MUST prove that identical canonical SourceSnapshot v1 and capsule inputs produce byte-identical capsule fingerprints without extraneous files or non-dependency repository artifacts.
3. `inv-k6a-containment-fail-closed` MUST prove that any file mutation within the delta (`created`, `modified`, `deleted`), relative path traversal (`../`), or symlink escape targeting a path outside declared `allowed_paths` halts execution fail-closed and emits a `containment-violation/v1` payload.
4. `inv-k6a-work-result-binding` MUST prove that `CaptureWorkResult` produces a canonical `work-result/v1` payload with applicable unified diff patch cryptographically bound via `computeWorkResultId` to `WorkOrderId` and `SourceSnapshotId`, and that K6a primitives never emit, accept, or return `CandidateId`.
5. `inv-k6a-interrupted-recovery-preservation` MUST prove that execution timeouts or `AbortSignal` cancellations preserve partial stdout/stderr logs and modified filesystem delta, producing an executable recovery state with workspace status `interrupted`.
6. `inv-k6a-host-isolation-fallback` MUST prove that command execution without `isolationReported=enforced` fails closed (no local command fallback). Non-command software-boundary paths MAY complete. `partial` / `instructional` / `unavailable` MUST NOT silently promote to `enforced`. An OS jail MUST NOT be required for `enforced`.
7. `inv-k6a-sandbox-policy-immutability` MUST prove that captured `{workspaceRoot, allowedPaths}` is immutable: after mutating `OSPEC_SANDBOX_*`, `spawn` / `execFile` / `fork` children remain confined to the original `allowed_paths`.
8. `inv-k6a-transport-binding` MUST prove WorkerIsolation `enforced` is bound to the executing WorkerTransport `port_id` / fingerprint; a different transport invalidates `enforced`.
9. `inv-k6a-real-containment-probe` MUST prove the probe attempts allowed / undeclared-workspace / external-root writes through that same transport and the host observes `PASS` / `BLOCKED` / `BLOCKED`.
10. `inv-k6a-mutating-fs-surface` MUST prove remaining Node 22+ mutating fs APIs (`mkdtemp*`, `chmod*`, `chown*`, `utimes*`, `lutimes*`, `mkdtempDisposable*` and equivalent styles) fail closed at the wrapper; post-flight inventory MUST NOT be the sole containment check.

(Previously: Six invariants; `inv-k6a-host-isolation-fallback` allowed documented command fallback without silent promotion to enforced; policy immutability, transport binding, real probe, and mutating-fs checkers were absent.)

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

#### Scenario: Model proves commands without enforced fail closed

- GIVEN isolation state `partial` or `unavailable` and a work order with commands
- WHEN `inv-k6a-host-isolation-fallback` runs
- THEN command execution MUST be refused
- AND `isolationReported` MUST NOT be `enforced`
- AND a non-command path MAY still complete without claiming `enforced`

#### Scenario: Model proves captured sandbox policy is immutable

- GIVEN a loaded sandbox policy snapshot
- WHEN `OSPEC_SANDBOX_*` is mutated and a child is spawned
- THEN `inv-k6a-sandbox-policy-immutability` MUST observe confinement to the original `allowed_paths`

#### Scenario: Model proves WorkerIsolation binds the executing transport

- GIVEN WorkerIsolation evidence for transport F and execution on transport G, G ≠ F
- WHEN `inv-k6a-transport-binding` runs
- THEN `enforced` MUST be invalidated

#### Scenario: Model proves the three-way probe is real

- GIVEN an executing WorkerTransport
- WHEN `inv-k6a-real-containment-probe` runs
- THEN allowed / undeclared / external writes MUST be attempted
- AND observed outcomes MUST be `PASS` / `BLOCKED` / `BLOCKED`

#### Scenario: Model proves mutating fs wrap is exhaustive

- GIVEN a sandboxed worker and an undeclared mutating fs target
- WHEN `inv-k6a-mutating-fs-surface` exercises `mkdtemp*`, `chmod*`, `chown*`, `utimes*`, `lutimes*`, and `mkdtempDisposable*` styles
- THEN each MUST fail closed at the wrapper
