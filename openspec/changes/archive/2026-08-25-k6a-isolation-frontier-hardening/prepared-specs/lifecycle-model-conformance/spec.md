# lifecycle-model-conformance Specification

## Purpose

Explore a bounded lifecycle state/action space and prove K2 invariants against the
real Minimal Kernel Harness without pretending to implement future Candidate,
budget, policy or delivery surfaces.

## Requirements

### Requirement: Reduced Model Is Explicit And Bounded {#REQ-lifecycle-model-conformance-001}

K2 MUST define a reduced lifecycle model with finite state domains, actions and
bounds. The model MUST document every abstraction from production state and MUST
be small enough for exhaustive or near-exhaustive exploration in CI.

#### Scenario: Model bounds are published

- GIVEN the model conformance suite
- WHEN its configuration is inspected
- THEN state domains, action set, depth/visit limits and abstraction mapping MUST
  be explicit and versioned

---

### Requirement: Executable K2 Invariants {#REQ-lifecycle-model-conformance-002}

The model suite MUST check all executable K2 invariants:

1. Same state produces the same ordered transitions.
2. Invalid transitions fail closed.
3. Replay does not duplicate effects.
4. Named recovery advances or terminates.
5. Models cannot directly mutate lifecycle state.
6. Terminal exhaustion cannot restart the same operation implicitly.
7. Events do not alter authoritative state.
8. A terminal state has no non-recovery execution transition.

#### Scenario: Every executable invariant has a checker

- GIVEN the model suite manifest
- WHEN K2 verification runs
- THEN every invariant above MUST map to an executable checker
- AND no checker MAY be marked optional

---

### Requirement: Opaque Future Ports {#REQ-lifecycle-model-conformance-003}

K2.1 MAY model subject- and budget-bound invalidation through opaque values named `SubjectId` and `BudgetRef`. `OperationPermit` and Authority Store revision digests MUST be concrete enforceable artifacts, not opaque placeholders. HostCapabilities states and CapabilityProof digests MUST also be concrete enforceable artifacts under K2a. `PolicySnapshot` digests, SourceSnapshot provenance bindings, and Execution Graph compile/replay invariants MUST be concrete enforceable model structures under K4a. Node execution budgets, authority/effects limits, causal failure taxonomy, and recovery transitions MUST be concrete enforceable model structures under K5. Worker workspace lifecycle descriptors, capsule definition fingerprints, allowed_paths containment enforcement, raw WorkResult capture bindings, and interrupted recovery transitions MUST be concrete enforceable model structures under K6a. The model MUST NOT inspect or invent the future internal structure of Candidate mutation, Candidate freeze (`freezeCandidate`), candidate verification, review attestation, or delivery authorization policy.
(Previously: Live worker container execution was opaque; K6a promotes workspace lifecycle, capsule definition, allowed_paths containment, raw WorkResult capture, and interrupted recovery to concrete enforceable model checks while Candidate mutation, verification, review attestation, and delivery policy remain opaque.)

#### Scenario: Subject change invalidates bound decision abstractly

- GIVEN a decision bound to opaque SubjectId A
- WHEN the model changes the authoritative subject to opaque SubjectId B
- THEN the previous decision MUST be stale
- AND no Candidate or delivery fields MUST be required

#### Scenario: Opaque AuthorityToken is insufficient for mutation

- GIVEN only an opaque non-empty AuthorityToken without a concrete permit
- WHEN the model attempts an authoritative mutation
- THEN the attempt MUST fail closed under K2.1 checkers
- AND MUST NOT count as an authorized advance

#### Scenario: CapabilityProof fields are concrete

- GIVEN a CapabilityProof missing evidence_digest
- WHEN the model suite checks enforcement eligibility
- THEN enforcement MUST fail closed
- AND MUST NOT require Candidate or delivery authorization fields

#### Scenario: PolicySnapshot and Execution Graph compile structures are concrete

- GIVEN a PolicySnapshot missing policy_bundle_digest or effective_rules
- WHEN the model suite checks graph compile validity
- THEN compile validation MUST fail closed
- AND MUST NOT require live worker execution authority

#### Scenario: Execution budget and causal recovery structures are concrete

- GIVEN a model execution state exploring node budget exhaustion or causal failure recovery
- WHEN the model suite checks budget monotonicity and recovery transitions
- THEN the structures MUST be evaluated as concrete verifiable model artifacts
- AND MUST NOT require live worker container execution authority

#### Scenario: Worker isolation and containment structures are concrete

- GIVEN a model execution state exploring workspace lifecycle, allowed_paths containment, or interrupted recovery
- WHEN the model suite checks isolation invariants
- THEN the structures MUST be evaluated as concrete verifiable model artifacts
- AND MUST NOT require Candidate freeze, review attestation, or delivery policy structures

---

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

---

### Requirement: Counterexamples Replay Through Harness {#REQ-lifecycle-model-conformance-005}

Every model counterexample MUST emit a stable action trace and seed. The trace MUST
be replayable through the Minimal Kernel Harness, or the report MUST identify the
specific abstraction that prevents direct replay.

#### Scenario: Counterexample is reproducible

- GIVEN the model finds an invariant violation
- WHEN its emitted trace is replayed through the harness
- THEN the same violation MUST reproduce
- OR the result MUST fail with a documented abstraction mismatch rather than
  silently passing

---

### Requirement: Model Suite Runs In CI {#REQ-lifecycle-model-conformance-006}

The bounded model suite MUST run under the repository's normal test command and
MUST NOT require TLA+, PlusCal, Alloy or an external service.

#### Scenario: Standard test command includes model exploration

- GIVEN a clean repository checkout with Node.js 22+
- WHEN `npm test` runs
- THEN the model conformance suite MUST execute

---

### Requirement: Executable K2.1 Authority Invariants {#REQ-lifecycle-model-conformance-007}

The model suite MUST check these executable K2.1 invariants against the real
Minimal Kernel Harness:

1. No authoritative mutation without successful compareAndSwap.
2. Stale permits (`expected_revision` ≠ head) are rejected.
3. Consumed permits cannot be reused.
4. Ambiguous irreversible effects never blind-retry; next kind is `decide` or
   `stop`.
5. Exact replay on the same revision converges.
6. Models cannot mint or self-grant OperationPermits.
7. Direct-write paths without permit + CAS + effect class are rejected.
8. Public auto-mint is not a valid authorization path; positive advances use
   controlled-issuer permits.
9. Exact replay returns the prior OperationReceipt without a second consume.

K2.1b checkers for invariants 8–9 MUST NOT be deferred.
#### Scenario: Every K2.1 invariant has a checker

- GIVEN the model suite manifest after K2.1
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2.1 checker MAY be marked optional or deferred

#### Scenario: Model cannot self-grant permits

- GIVEN a model action that fabricates an OperationPermit
- WHEN the model suite explores that action
- THEN authorize MUST fail closed
- AND the checker for invariant 6 MUST record a pass only if rejection holds

#### Scenario: Auto-mint path is rejected by checker

- GIVEN a model action that relies on public mintPermit defaulting to true
- WHEN the model suite explores that action
- THEN the checker for invariant 8 MUST fail the path
- AND MUST pass only when issuer-produced permits are required

---

### Requirement: Executable K2a Host-Agnostic Invariants {#REQ-lifecycle-model-conformance-008}

The model suite MUST check these executable K2a invariants against the real
Minimal Kernel Harness and/or Headless Conformance Host public entrypoints:

1. Lifecycle/Graph/receipt modules have zero concrete host product imports.
2. Capabilities in `unavailable` or `instructional` never silently become
   `enforced`.
3. `enforced` requires a verifying CapabilityProof
   (adapter_version + host_version + fixture + evidence_digest).
4. Adapters that duplicate lifecycle or Graph semantics are rejected.
5. Exactly one real product adapter (`claude`) is activated; others remain
   inactive.
6. Host-fault matrix covers timeout, cancel, worker fail, and interrupt.

#### Scenario: Every K2a invariant has a checker

- GIVEN the model suite manifest after K2a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2a checker MAY be marked optional or deferred

#### Scenario: Silent promotion is rejected by checker

- GIVEN a model action that promotes `unavailable` to `enforced` without proof
- WHEN the model suite explores that action
- THEN the checker for invariant 2 MUST fail the promotion
- AND MUST record a pass only if refusal holds

---

### Requirement: Executable K2.1b Issuance And Consume Invariants {#REQ-lifecycle-model-conformance-009}

The model suite MUST check these executable K2.1b invariants against the real
Minimal Kernel Harness:

1. No operation is authorized solely because the transition is state-valid.
2. No commit completes without a previously issued OperationPermit.
3. No state commit succeeds without permit consumed status recorded in the same
   Authority Store revision as next_state / next_journal / OperationReceipt.
4. Exact identical replay returns the prior OperationReceipt (no second ledger
   or receipt).
5. After in-process restart, permit consumed status and receipt remain
   verifiable from the Authority Store revision.

#### Scenario: Every K2.1b invariant has a checker

- GIVEN the model suite manifest after K2.1b
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2.1b checker MAY be marked optional or deferred

#### Scenario: State-valid alone cannot authorize

- GIVEN a model action that is state-valid but supplies no issuer-produced permit
- WHEN the model suite explores that action
- THEN authorize MUST fail closed
- AND the checker for invariant 1 MUST pass only if rejection holds

#### Scenario: Commit without same-revision consume fails checker

- GIVEN a model trace that advances head without consumed permit in that revision
- WHEN the suite evaluates invariant 3
- THEN the checker MUST fail the trace
- AND MUST pass only when consume and receipt share the winning revision

---

### Requirement: Executable K4a Execution Graph Compile And Replay Invariants {#REQ-lifecycle-model-conformance-010}

The model suite MUST check these executable K4a invariants against the Minimal Kernel Harness and Execution Graph compiler:

1. Deterministic Graph ID binding: identical change contract digest + identical PolicySnapshot + identical SourceSnapshot ID produce identical Graph ID.
2. Policy divergence: identical change contract + divergent effectiveRules produce distinct PolicySnapshot and Graph IDs.
3. Obligation Manifest coverage: every contract MUST obligation has non-empty `implemented_by` and `required_evidence`, or explicit recorded deferral.
4. Clarify invalidation boundary: ClarifyEvent invalidates strictly declared descendant nodes in the DAG, preserving unaffected ancestor and sibling states.
5. Replay convergence: fixture replay under identical inputs produces identical outcome state without state mutation.
6. Shadow non-interference: shadow compilation executes alongside fixed routing on identical inputs with zero mutation of active workflow state.
7. No live worker execution authority and atomic provenance binding: compilation and replay operate strictly on declarative shapes without issuing runtime execution authority, enforcing atomic graph validation and exact SourceSnapshot binding.

#### Scenario: Every K4a invariant has an executable checker

- GIVEN the model suite manifest after K4a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K4a checker MAY be marked optional or deferred

#### Scenario: Graph ID divergence upon policy rule modification

- GIVEN a model execution with fixed contract and modified effectiveRules in PolicySnapshot
- WHEN the model suite checks compile invariants
- THEN the checker for invariant 2 MUST verify that distinct Graph IDs are generated

#### Scenario: Non-interference checker verifies zero active state mutation

- GIVEN a model execution exploring shadow comparison paths
- WHEN the model suite checks invariant 6
- THEN the checker MUST verify that active state and journal remain unmodified

---

---

### Requirement: Executable K5 Budget Monotonicity And Causal Recovery Invariants {#REQ-lifecycle-model-conformance-011}

The model suite MUST check all seven executable K5 invariants through full runtime composition, including `createKernelRuntime`, `runKernelOperation`, Authority Store CAS, selector, reducer, and permit ledger:

1. `inv-k5-budget-monotonicity` MUST prove that executor-reported usage is committed exactly once on CAS success and retained exactly once as subject/node carry-over on every post-effect non-success exit; skipped or historical journal results MUST not create usage.
2. `inv-k5-causal-priority` MUST resolve the highest causal category through the runtime resolver.
3. `inv-k5-allowlist-enforcement` MUST enforce only allowlisted recovery transitions and allow terminal CAS consolidation under exhaustion.
4. `inv-k5-zero-delta-consumption` MUST dual-decrement sterile effect mutations, including lifecycle-advancing `repair` with no effect progress, while excluding read-only and terminal controls.
5. `inv-k5-budget-exhaustion-terminal` MUST reject exhausted non-terminal execution before effects.
6. `inv-k5-honest-recovery-advancement` MUST require blocking-fingerprint advance or termination.
7. `inv-k5-telemetry-isolation` MUST preserve semantic digest isolation.

The suite MUST prove that absent required `ExecutionUsage` fails closed without caller-argument fallback and that journal `completed` cannot degrade under stale merge.

(Previously: The K5 model suite did not require success and post-effect exactly-once accounting, sterile-repair zero-delta, or non-degradable completed journal evidence.)

#### Scenario: Model proves successful execution usage is committed once

- GIVEN a physical effect reports commands, patches, and changed lines
- WHEN its CAS succeeds
- THEN the checker MUST observe one matching budget decrement
- AND no carry-over for that execution

#### Scenario: Model proves repeated CAS loss does not re-debit skip

- GIVEN one effect execution reports 3 turns and loses two consecutive CAS attempts
- WHEN retries reconcile a completed journal record
- THEN the checker MUST observe exactly 3 carried turns
- AND exactly one executor invocation

#### Scenario: Model proves failed effect retains usage and missing usage fails closed

- GIVEN an effect that reports usage then fails, and a separate effect lacking usage
- WHEN each reaches post-effect accounting
- THEN the first MUST retain carry-over and the second MUST fail closed
- AND neither MAY use caller-provided arguments

#### Scenario: Model proves sterile repair is zero-delta

- GIVEN repair advances lifecycle state with no effect progress or file delta
- WHEN `inv-k5-zero-delta-consumption` runs
- THEN it MUST observe one decrement of turns and effect attempts
- AND a pre-CAS `zero-delta-attempt` journal event

#### Scenario: Model proves completed journal status is monotonic

- GIVEN `eff-101` is completed in the Authority Store
- WHEN a stale writer submits a lower-progress status for the same effect ID
- THEN the checker MUST observe completed and its result evidence unchanged

---

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
